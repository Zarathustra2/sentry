import React from 'react';
import PropTypes from 'prop-types';

import {t} from 'app/locale';
import SearchBar from 'app/components/searchBar';
import SentryTypes from 'app/sentryTypes';
import {Panel} from 'app/components/panels';
import EventView from 'app/views/eventsV2/eventView';

import {SentryTransactionEvent} from './types';
import TraceView from './traceView';

type PropType = {
  orgId: string;
  event: SentryTransactionEvent;
  eventView: EventView;
};

type State = {
  searchQuery: string | undefined;
};

class SpansInterface extends React.Component<PropType, State> {
  static propTypes = {
    event: SentryTypes.Event.isRequired,
    orgId: PropTypes.string.isRequired,
  };

  state: State = {
    searchQuery: undefined,
  };

  handleSpanFilter = (searchQuery: string) => {
    this.setState({
      searchQuery: searchQuery || undefined,
    });
  };

  render() {
    const {event, orgId, eventView} = this.props;

    return (
      <div>
        <SearchBar
          defaultQuery=""
          query={this.state.searchQuery || ''}
          placeholder={t('Filter on spans')}
          onSearch={this.handleSpanFilter}
        />
        <br />
        <Panel>
          <TraceView
            event={event}
            searchQuery={this.state.searchQuery}
            orgId={orgId}
            eventView={eventView}
          />
        </Panel>
      </div>
    );
  }
}

export default SpansInterface;
