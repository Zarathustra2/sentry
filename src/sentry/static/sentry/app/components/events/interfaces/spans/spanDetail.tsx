import React from 'react';
import styled from 'react-emotion';
import get from 'lodash/get';
import map from 'lodash/map';

import DateTime from 'app/components/dateTime';
import Pills from 'app/components/pills';
import Pill from 'app/components/pill';
import space from 'app/styles/space';
import withApi from 'app/utils/withApi';
import {Client} from 'app/api';
import {
  generateEventSlug,
  generateEventDetailsRoute,
} from 'app/views/eventsV2/eventDetails/utils';
import Button from 'app/components/button';

import {SpanType} from './types';
import {t} from 'app/locale';

type TransactionResult = {
  'project.name': String;
  transaction: String;
  id: String;
};

type Props = {
  api: Client;
  span: Readonly<SpanType>;
  orgId: string;
};

type State = {
  parentEventSlug?: string;
};

class SpanDetail extends React.Component<Props, State> {
  state: State = {
    parentEventSlug: undefined,
  };

  componentDidMount() {
    const {span} = this.props;

    if (span.parent_span_id) {
      this.fetchSpan(span.parent_span_id)
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
            parentEventSlug: generateEventSlug({
              id: result.id,
              'project.name': result['project.name'],
            }),
          });
        })
        .catch(_error => {
          // don't do anything
        });
    }

    this.fetchSpan(span.span_id)
      .then(response => {
        console.log('response', span.span_id, response);
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
      query: `event.type:transaction trace:${span.trace_id} trace.span:${spanID}`,
    };

    return api.requestPromise(url, {
      method: 'GET',
      query,
    });
  }

  renderParentButton(): React.ReactNode {
    if (!this.state.parentEventSlug) {
      return null;
    }

    const parentTransaction = generateEventDetailsRoute({
      eventSlug: this.state.parentEventSlug,
      orgSlug: this.props.orgId,
    });

    return (
      <div>
        <Button size="xsmall" href={parentTransaction}>
          {t('Go to parent transaction')}
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
        {this.renderParentButton()}
        <table className="table key-value">
          <tbody>
            <Row title="Span ID">{span.span_id}</Row>
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

const Row = ({
  title,
  keep,
  children,
}: {
  title: string;
  keep?: boolean;
  children: JSX.Element | string;
}) => {
  if (!keep && !children) {
    return null;
  }

  return (
    <tr>
      <td className="key">{title}</td>
      <td className="value">
        <pre className="val">
          <span className="val-string">{children}</span>
        </pre>
      </td>
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
