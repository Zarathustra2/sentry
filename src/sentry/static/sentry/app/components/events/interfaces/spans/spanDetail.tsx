import React from 'react';
import styled from 'react-emotion';
import get from 'lodash/get';
import map from 'lodash/map';

import {t} from 'app/locale';
import DateTime from 'app/components/dateTime';
import Pills from 'app/components/pills';
import Pill from 'app/components/pill';
import space from 'app/styles/space';
import withApi from 'app/utils/withApi';
import {Client} from 'app/api';
import Button from 'app/components/button';
import {
  generateEventSlug,
  generateEventDetailsRoute,
} from 'app/views/eventsV2/eventDetails/utils';
import EventView from 'app/views/eventsV2/eventView';

import {SpanType} from './types';

type TransactionResult = {
  'project.name': String;
  transaction: String;
  id: String;
};

type Props = {
  api: Client;
  orgId: string;
  span: Readonly<SpanType>;
  isRoot: boolean;
  eventView: EventView;
};

type State = {
  eventSlug?: string;
};

class SpanDetail extends React.Component<Props, State> {
  state: State = {
    eventSlug: undefined,
  };

  componentDidMount() {
    const {span, isRoot} = this.props;

    if (isRoot) {
      return;
    }

    this.fetchSpan(span.span_id)
      .then(response => {
        if (
          !response.data ||
          !Array.isArray(response.data) ||
          response.data.length <= 0
        ) {
          return;
        }

        const result: TransactionResult = response.data[0];

        this.setState({
          eventSlug: generateEventSlug({
            id: result.id,
            'project.name': result['project.name'],
          }),
        });
      })
      .catch(_error => {
        // don't do anything
      });
  }

  fetchSpan(spanID: string): Promise<any> {
    const {api, orgId, span} = this.props;

    const url = `/organizations/${orgId}/eventsv2/`;

    const query = {
      field: ['transaction', 'id'],
      sort: ['-id'],
      query: `event.type:transaction trace:${span.trace_id} trace.parent_span:${spanID}`,
    };

    return api.requestPromise(url, {
      method: 'GET',
      query,
    });
  }

  renderTraversalButton(): React.ReactNode {
    if (!this.state.eventSlug) {
      return null;
    }

    const {eventView} = this.props;

    const parentTransactionLink = generateEventDetailsRoute({
      eventSlug: this.state.eventSlug,
      orgSlug: this.props.orgId,
    });

    const to = {
      pathname: parentTransactionLink,
      query: eventView.generateQueryStringObject(),
    };

    return (
      <div>
        <Button size="xsmall" to={to}>
          {t('Open span')}
        </Button>
      </div>
    );
  }

  render() {
    const {span} = this.props;

    const startTimestamp: number = span.start_timestamp;
    const endTimestamp: number = span.timestamp;

    const duration = (endTimestamp - startTimestamp) * 1000;
    const durationString = `${duration.toFixed(3)} ms`;

    return (
      <SpanDetailContainer
        data-component="span-detail"
        onClick={event => {
          // prevent toggling the span detail
          event.stopPropagation();
        }}
      >
        <table className="table key-value">
          <tbody>
            <Row title="Span ID" extra={this.renderTraversalButton()}>
              {span.span_id}
            </Row>
            <Row title="Trace ID">{span.trace_id}</Row>
            <Row title="Parent Span ID">{span.parent_span_id || ''}</Row>
            <Row title="Description">{get(span, 'description', '')}</Row>
            <Row title="Start Date">
              <React.Fragment>
                <DateTime date={startTimestamp * 1000} />
                {` (${startTimestamp})`}
              </React.Fragment>
            </Row>
            <Row title="End Date">
              <React.Fragment>
                <DateTime date={endTimestamp * 1000} />
                {` (${endTimestamp})`}
              </React.Fragment>
            </Row>
            <Row title="Duration">{durationString}</Row>
            <Row title="Operation">{span.op || ''}</Row>
            <Row title="Same Process as Parent">
              {String(!!span.same_process_as_parent)}
            </Row>
            <Tags span={span} />
            {map(get(span, 'data', {}), (value, key) => {
              return (
                <Row title={key} key={key}>
                  {JSON.stringify(value, null, 4) || ''}
                </Row>
              );
            })}
            <Row title="Raw">{JSON.stringify(span, null, 4)}</Row>
          </tbody>
        </table>
      </SpanDetailContainer>
    );
  }
}

const SpanDetailContainer = styled('div')`
  border-bottom: 1px solid ${p => p.theme.gray1};
  padding: ${space(2)};
  cursor: auto;
`;

const ValueTd = styled('td')`
  display: flex !important;
  max-width: 100% !important;
  align-items: center;
`;

const PreValue = styled('pre')`
  flex: 1;
`;

const Row = ({
  title,
  keep,
  children,
  extra = null,
}: {
  title: string;
  keep?: boolean;
  children: JSX.Element | string;
  extra?: React.ReactNode;
}) => {
  if (!keep && !children) {
    return null;
  }

  return (
    <tr>
      <td className="key">{title}</td>
      <ValueTd className="value">
        <PreValue className="val">
          <span className="val-string">{children}</span>
        </PreValue>
        {extra}
      </ValueTd>
    </tr>
  );
};

const Tags = ({span}: {span: SpanType}) => {
  const tags: {[tag_name: string]: string} | undefined = get(span, 'tags');

  if (!tags) {
    return null;
  }

  const keys = Object.keys(tags);

  if (keys.length <= 0) {
    return null;
  }

  return (
    <tr>
      <td className="key">Tags</td>
      <td className="value">
        <Pills style={{padding: '8px'}}>
          {keys.map((key, index) => {
            return <Pill key={index} name={key} value={String(tags[key]) || ''} />;
          })}
        </Pills>
      </td>
    </tr>
  );
};

export default withApi(SpanDetail);
