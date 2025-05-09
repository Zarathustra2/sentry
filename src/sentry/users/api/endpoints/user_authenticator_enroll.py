import logging
from base64 import b64encode
from typing import Any

import petname
from django.http import HttpResponse
from rest_framework import serializers, status
from rest_framework.fields import SkipField
from rest_framework.request import Request
from rest_framework.response import Response

from sentry import ratelimits as ratelimiter
from sentry.api.api_owners import ApiOwner
from sentry.api.api_publish_status import ApiPublishStatus
from sentry.api.base import control_silo_endpoint
from sentry.api.decorators import primary_email_verification_required, sudo_required
from sentry.api.invite_helper import ApiInviteHelper, remove_invite_details_from_session
from sentry.api.serializers import serialize
from sentry.auth.authenticators.base import EnrollmentStatus, NewEnrollmentDisallowed
from sentry.auth.authenticators.sms import SmsInterface, SMSRateLimitExceeded
from sentry.auth.authenticators.totp import TotpInterface
from sentry.auth.authenticators.u2f import U2fInterface
from sentry.organizations.services.organization import organization_service
from sentry.security.utils import capture_security_activity
from sentry.users.api.bases.user import UserEndpoint
from sentry.users.api.serializers.authenticator import get_interface_serializer
from sentry.users.models.authenticator import Authenticator
from sentry.users.models.user import User
from sentry.utils.auth import MFA_SESSION_KEY

logger = logging.getLogger(__name__)

ALREADY_ENROLLED_ERR = {"details": "Already enrolled"}
INVALID_AUTH_STATE = {"details": "Invalid auth state"}
INVALID_OTP_ERR = ({"details": "Invalid OTP"},)
SEND_SMS_ERR = {"details": "Error sending SMS"}
DISALLOWED_NEW_ENROLLMENT_ERR = {
    "details": "New enrollments for this 2FA interface are not allowed"
}


class TotpRestSerializer(serializers.Serializer[Authenticator]):
    otp = serializers.CharField(
        label="Authenticator token",
        help_text="Code from authenticator",
        required=True,
        max_length=20,
        trim_whitespace=False,
    )


class SmsRestSerializer(serializers.Serializer[Authenticator]):
    phone = serializers.CharField(
        label="Phone number",
        help_text="Phone number to send SMS code",
        required=True,
        max_length=20,
        trim_whitespace=False,
    )
    otp = serializers.CharField(
        label="Authenticator code",
        help_text="Code from authenticator",
        required=False,
        allow_null=True,
        allow_blank=True,
        max_length=20,
        trim_whitespace=False,
    )


class U2fRestSerializer(serializers.Serializer[Authenticator]):
    deviceName = serializers.CharField(
        label="Device name",
        required=False,
        allow_null=True,
        allow_blank=True,
        max_length=60,
        trim_whitespace=False,
        default=lambda: petname.generate(2, " ", letters=10).title(),
    )
    challenge = serializers.CharField(required=True, trim_whitespace=False)
    response = serializers.CharField(required=True, trim_whitespace=False)


serializer_map = {"totp": TotpRestSerializer, "sms": SmsRestSerializer, "u2f": U2fRestSerializer}


def get_serializer_field_metadata(
    serializer: serializers.Serializer[Authenticator], fields: list[str] | None = None
) -> list[dict[str, Any]]:
    """Returns field metadata for serializer"""
    meta = []
    for field_name, field in serializer.fields.items():
        if (fields is None or field_name in fields) and field_name:
            try:
                default = field.get_default()
            except SkipField:
                default = None
            serialized_field = {
                "name": field_name,
                "defaultValue": default,
                "read_only": field.read_only,
                "required": field.required,
                "type": "string",
            }
            if hasattr(field, "max_length") and field.max_length:
                serialized_field["max_length"] = field.max_length
            if field.label:
                serialized_field["label"] = field.label

            meta.append(serialized_field)

    return meta


@control_silo_endpoint
class UserAuthenticatorEnrollEndpoint(UserEndpoint):
    publish_status = {
        "GET": ApiPublishStatus.PRIVATE,
        "POST": ApiPublishStatus.PRIVATE,
    }
    owner = ApiOwner.ENTERPRISE

    @sudo_required
    def get(self, request: Request, user: User, interface_id: str) -> HttpResponse:
        """
        Get Authenticator Interface
        ```````````````````````````

        Retrieves authenticator interface details for user depending on user enrollment status

        :pparam string user_id: user id or "me" for current user
        :pparam string interface_id: interface id

        :auth: required
        """

        interface = Authenticator.objects.get_interface(user, interface_id)

        if interface.is_enrolled():
            # Not all interfaces allow multi enrollment
            if interface.allow_multi_enrollment:
                interface.status = EnrollmentStatus.MULTI
            elif interface.allow_rotation_in_place:
                # The new interface object returns False from
                # interface.is_enrolled(), which is misleading.
                # The status attribute can disambiguate where necessary.
                interface = interface.generate(EnrollmentStatus.ROTATION)
            else:
                return Response(ALREADY_ENROLLED_ERR, status=status.HTTP_400_BAD_REQUEST)

        # User is not enrolled in auth interface:
        # - display configuration form
        response = serialize(interface, serializer=get_interface_serializer(interface))
        response["form"] = get_serializer_field_metadata(serializer_map[interface_id]())

        # U2fInterface has no 'secret' attribute
        if hasattr(interface, "secret"):
            response["secret"] = interface.secret

        if interface_id == "totp":
            assert isinstance(
                interface, TotpInterface
            ), "Interface must be a TotpInterface to get provision URL"
            response["qrcode"] = interface.get_provision_url(user.email)

        if interface_id == "u2f":
            assert isinstance(
                interface, U2fInterface
            ), "Interface must be a U2fInterface to start enrollement"
            publicKeyCredentialCreate, state = interface.start_enrollment(user)
            response["challenge"] = {}
            response["challenge"]["webAuthnRegisterData"] = b64encode(publicKeyCredentialCreate)
            request.session["webauthn_register_state"] = state
        return Response(response)

    @sudo_required
    @primary_email_verification_required
    def post(self, request: Request, user: User, interface_id: str) -> HttpResponse:
        """
        Enroll in authenticator interface
        `````````````````````````````````

        :pparam string user_id: user id or "me" for current user
        :pparam string interface_id: interface id

        :auth: required
        """
        if ratelimiter.backend.is_limited(
            f"auth:authenticator-enroll:{request.user.id}:{interface_id}",
            limit=10,
            window=86400,  # 10 per day should be fine
        ):
            return HttpResponse(
                "You have made too many authenticator enrollment attempts. Please try again later.",
                content_type="text/plain",
                status=429,
            )

        # TODO: Investigate the behavior below and see if it makes more sense to
        # error rather than silently switch to the superuser/staff user.

        # Using `request.user` here because superuser/staff should not be able to set a user's 2fa
        if user.id != request.user.id:
            user = User.objects.get(id=request.user.id)

        # start activation
        serializer_cls = serializer_map.get(interface_id, None)

        if serializer_cls is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = serializer_cls(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        interface = Authenticator.objects.get_interface(user, interface_id)

        # Check if the 2FA interface allows new enrollment, if not we should error
        # on any POSTs
        if interface.disallow_new_enrollment:
            return Response(DISALLOWED_NEW_ENROLLMENT_ERR, status=status.HTTP_403_FORBIDDEN)

        # Not all interfaces allow multi enrollment
        #
        # This is probably un-needed because we catch
        # `Authenticator.AlreadyEnrolled` when attempting to enroll
        if interface.is_enrolled():
            if interface.allow_multi_enrollment:
                interface.status = EnrollmentStatus.MULTI
            elif interface.allow_rotation_in_place:
                interface.status = EnrollmentStatus.ROTATION
            else:
                return Response(ALREADY_ENROLLED_ERR, status=status.HTTP_400_BAD_REQUEST)

        if hasattr(interface, "secret"):
            interface.secret = request.data["secret"]

        context = {}
        # Need to update interface with phone number before validating OTP
        if "phone" in request.data:
            assert isinstance(
                interface, SmsInterface
            ), "Interface must be a SmsInterface to get phone number"
            interface.phone_number = serializer.data["phone"]

            # Disregarding value of 'otp', if no OTP was provided,
            # send text message to phone number with OTP
            if "otp" not in request.data:
                try:
                    if interface.send_text(for_enrollment=True, request=request._request):
                        return Response(status=status.HTTP_204_NO_CONTENT)
                    else:
                        # Error sending text message
                        return Response(SEND_SMS_ERR, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                except SMSRateLimitExceeded as e:
                    logger.warning(
                        "auth-enroll.sms.rate-limit-exceeded",
                        extra={
                            "remote_ip": f"{e.remote_ip}",
                            "user_id": f"{e.user_id}",
                            "phone_number": f"{e.phone_number}",
                        },
                    )
                    return Response(SEND_SMS_ERR, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # Attempt to validate OTP
        if "otp" in request.data and not interface.validate_otp(serializer.data["otp"]):
            return Response(INVALID_OTP_ERR, status=status.HTTP_400_BAD_REQUEST)

        # Try u2f enrollment
        if interface_id == "u2f":
            if "webauthn_register_state" not in request.session:
                return Response(INVALID_AUTH_STATE, status=status.HTTP_400_BAD_REQUEST)
            state = request.session["webauthn_register_state"]

            assert isinstance(interface, U2fInterface), "Interface must be a U2fInterface to enroll"
            interface.try_enroll(
                serializer.data["challenge"],
                serializer.data["response"],
                serializer.data["deviceName"],
                state,
            )
            context.update({"device_name": serializer.data["deviceName"]})

        if interface.status == EnrollmentStatus.ROTATION:
            interface.rotate_in_place()
        else:
            try:
                interface.enroll(user)
            except Authenticator.AlreadyEnrolled:
                return Response(ALREADY_ENROLLED_ERR, status=status.HTTP_400_BAD_REQUEST)
            except NewEnrollmentDisallowed:
                return Response(DISALLOWED_NEW_ENROLLMENT_ERR, status=status.HTTP_403_FORBIDDEN)

        context.update({"authenticator": interface.authenticator})
        capture_security_activity(
            account=user,
            type="mfa-added",
            actor=user,
            ip_address=request.META["REMOTE_ADDR"],
            context=context,
            send_email=True,
        )

        user.clear_lost_passwords()
        user.refresh_session_nonce(self.request)
        user.save()
        Authenticator.objects.auto_add_recovery_codes(user)

        request.session[MFA_SESSION_KEY] = str(user.id)

        response = Response(status=status.HTTP_204_NO_CONTENT)

        # If there is a pending organization invite accept after the
        # authenticator has been configured.
        request.user = (
            user  # Load in the canonical user object so the invite helper references it correctly.
        )
        invite_helper = ApiInviteHelper.from_session(request=request, logger=logger)

        if invite_helper:
            if invite_helper.member_already_exists:
                invite_helper.handle_member_already_exists()
                organization_service.delete_organization_member(
                    organization_member_id=invite_helper.invite_context.invite_organization_member_id,
                    organization_id=invite_helper.invite_context.organization.id,
                )
                remove_invite_details_from_session(request)
            elif invite_helper.valid_request:
                invite_helper.accept_invite(user)
                remove_invite_details_from_session(request)

        return response
