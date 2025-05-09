import type React from 'react';
import {createContext, useCallback, useContext, useMemo} from 'react';
import type {Location} from 'history';

import type {Sort} from 'sentry/utils/discover/fields';
import {DiscoverDatasets} from 'sentry/utils/discover/types';
import {useLocation} from 'sentry/utils/useLocation';
import {useNavigate} from 'sentry/utils/useNavigate';
import useOrganization from 'sentry/utils/useOrganization';
import {
  defaultId,
  getIdFromLocation,
  updateLocationWithId,
} from 'sentry/views/explore/contexts/pageParamsContext/id';

import {
  defaultDataset,
  getDatasetFromLocation,
  updateLocationWithDataset,
} from './dataset';
import {defaultFields, getFieldsFromLocation, updateLocationWithFields} from './fields';
import {
  defaultGroupBys,
  getGroupBysFromLocation,
  updateLocationWithGroupBys,
} from './groupBys';
import {defaultMode, getModeFromLocation, Mode, updateLocationWithMode} from './mode';
import {defaultQuery, getQueryFromLocation, updateLocationWithQuery} from './query';
import {
  defaultSortBys,
  getSortBysFromLocation,
  updateLocationWithSortBys,
} from './sortBys';
import {defaultTitle, getTitleFromLocation, updateLocationWithTitle} from './title';
import type {BaseVisualize, Visualize} from './visualizes';
import {
  defaultVisualizes,
  getVisualizesFromLocation,
  updateLocationWithVisualizes,
} from './visualizes';

interface ReadablePageParams {
  dataset: DiscoverDatasets | undefined;
  fields: string[];
  groupBys: string[];
  mode: Mode;
  query: string;
  sortBys: Sort[];
  visualizes: Visualize[];
  id?: string;
  title?: string;
}

interface WritablePageParams {
  dataset?: DiscoverDatasets | null;
  fields?: string[] | null;
  groupBys?: string[] | null;
  id?: string | null;
  mode?: Mode | null;
  query?: string | null;
  sortBys?: Sort[] | null;
  title?: string | null;
  visualizes?: BaseVisualize[] | null;
}

export interface SuggestedQuery {
  fields: string[];
  groupBys: string[];
  mode: Mode;
  query: string;
  sortBys: Sort[];
  title: string;
  visualizes: BaseVisualize[];
}

function defaultPageParams(): ReadablePageParams {
  const dataset = defaultDataset();
  const fields = defaultFields();
  const groupBys = defaultGroupBys();
  const mode = defaultMode();
  const query = defaultQuery();
  const visualizes = defaultVisualizes();
  const title = defaultTitle();
  const id = defaultId();
  const sortBys = defaultSortBys(
    mode,
    fields,
    visualizes.flatMap(visualize => visualize.yAxes)
  );

  return {
    dataset,
    fields,
    groupBys,
    mode,
    query,
    sortBys,
    title,
    id,
    visualizes,
  };
}

const PageParamsContext = createContext<ReadablePageParams>(defaultPageParams());

interface PageParamsProviderProps {
  children: React.ReactNode;
}

export function PageParamsProvider({children}: PageParamsProviderProps) {
  const location = useLocation();
  const organization = useOrganization();

  const pageParams: ReadablePageParams = useMemo(() => {
    const dataset = getDatasetFromLocation(location);
    const fields = getFieldsFromLocation(location);
    const groupBys = getGroupBysFromLocation(location);
    const mode = getModeFromLocation(location);
    const query = getQueryFromLocation(location);
    const visualizes = getVisualizesFromLocation(location, organization);
    const sortBys = getSortBysFromLocation(location, mode, fields, groupBys, visualizes);
    const title = getTitleFromLocation(location);
    const id = getIdFromLocation(location);

    return {
      dataset,
      fields,
      groupBys,
      mode,
      query,
      sortBys,
      title,
      id,
      visualizes,
    };
  }, [location, organization]);

  return <PageParamsContext value={pageParams}>{children}</PageParamsContext>;
}

export function useExplorePageParams(): ReadablePageParams {
  return useContext(PageParamsContext);
}

export function useExploreDataset(): DiscoverDatasets {
  return DiscoverDatasets.SPANS_EAP_RPC;
}

export function useExploreFields(): string[] {
  const pageParams = useExplorePageParams();
  return pageParams.fields;
}

export function useExploreGroupBys(): string[] {
  const pageParams = useExplorePageParams();
  return pageParams.groupBys;
}

export function useExploreMode(): Mode {
  const pageParams = useExplorePageParams();
  return pageParams.mode;
}

export function useExploreQuery(): string {
  const pageParams = useExplorePageParams();
  return pageParams.query;
}

export function useExploreSortBys(): Sort[] {
  const pageParams = useExplorePageParams();
  return pageParams.sortBys;
}

export function useExploreTitle(): string | undefined {
  const pageParams = useExplorePageParams();
  return pageParams.title;
}

export function useExploreId(): string | undefined {
  const pageParams = useExplorePageParams();
  return pageParams.id;
}

export function useExploreVisualizes(): Visualize[] {
  const pageParams = useExplorePageParams();
  return pageParams.visualizes;
}

export function newExploreTarget(
  location: Location,
  pageParams: WritablePageParams
): Location {
  const target = {...location, query: {...location.query}};
  updateLocationWithDataset(target, pageParams.dataset);
  updateLocationWithFields(target, pageParams.fields);
  updateLocationWithGroupBys(target, pageParams.groupBys);
  updateLocationWithMode(target, pageParams.mode);
  updateLocationWithQuery(target, pageParams.query);
  updateLocationWithSortBys(target, pageParams.sortBys);
  updateLocationWithVisualizes(target, pageParams.visualizes);
  updateLocationWithTitle(target, pageParams.title);
  updateLocationWithId(target, pageParams.id);
  return target;
}

export function useSetExplorePageParams() {
  const location = useLocation();
  const navigate = useNavigate();

  return useCallback(
    (pageParams: WritablePageParams) => {
      const target = newExploreTarget(location, pageParams);
      navigate(target);
    },
    [location, navigate]
  );
}

export function useSetExploreFields() {
  const setPageParams = useSetExplorePageParams();
  return useCallback(
    (fields: string[]) => {
      setPageParams({fields});
    },
    [setPageParams]
  );
}

export function useSetExploreGroupBys() {
  const setPageParams = useSetExplorePageParams();
  return useCallback(
    (groupBys: string[], mode?: Mode) => {
      if (mode) {
        setPageParams({groupBys, mode});
      } else {
        setPageParams({groupBys});
      }
    },
    [setPageParams]
  );
}

export function useSetExploreMode() {
  const pageParams = useExplorePageParams();
  const setPageParams = useSetExplorePageParams();

  return useCallback(
    (mode: Mode) => {
      if (mode === Mode.SAMPLES && pageParams.groupBys.some(groupBy => groupBy !== '')) {
        // When switching from the aggregates to samples mode, carry
        // over any group bys as they are helpful context when looking
        // for examples.
        const fields = [...pageParams.fields];
        for (const groupBy of pageParams.groupBys) {
          if (groupBy !== '' && !fields.includes(groupBy)) {
            fields.push(groupBy);
          }
        }

        setPageParams({
          mode,
          fields,
        });
      } else {
        setPageParams({mode});
      }
    },
    [pageParams, setPageParams]
  );
}

export function useSetExploreQuery() {
  const setPageParams = useSetExplorePageParams();
  return useCallback(
    (query: string) => {
      setPageParams({query});
    },
    [setPageParams]
  );
}

export function useSetExploreSortBys() {
  const setPageParams = useSetExplorePageParams();
  return useCallback(
    (sortBys: Sort[]) => {
      setPageParams({sortBys});
    },
    [setPageParams]
  );
}

export function useSetExploreVisualizes() {
  const pageParams = useExplorePageParams();
  const setPageParams = useSetExplorePageParams();
  return useCallback(
    (visualizes: BaseVisualize[], fields?: string[]) => {
      const writablePageParams: WritablePageParams = {visualizes};
      const newFields = fields?.filter(field => !pageParams.fields.includes(field)) || [];
      if (newFields.length > 0) {
        writablePageParams.fields = [...pageParams.fields, ...newFields];
      }
      setPageParams(writablePageParams);
    },
    [pageParams, setPageParams]
  );
}

export function useSetExploreTitle() {
  const setPageParams = useSetExplorePageParams();
  return useCallback(
    (title: string) => {
      setPageParams({title});
    },
    [setPageParams]
  );
}

export function useSetExploreId() {
  const setPageParams = useSetExplorePageParams();
  return useCallback(
    (id: string) => {
      setPageParams({id});
    },
    [setPageParams]
  );
}
