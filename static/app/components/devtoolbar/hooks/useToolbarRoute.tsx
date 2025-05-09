import {createContext, useCallback, useContext, useState} from 'react';

type State = {
  activePanel:
    | null
    | 'alerts'
    | 'feedback'
    | 'issues'
    | 'featureFlags'
    | 'releases'
    | 'replay';
};

const Context = createContext<{
  setActivePanel: (activePanel: State['activePanel']) => void;
  state: State;
}>({
  setActivePanel(_activePanel: State['activePanel']) {},
  state: {activePanel: null},
});

export function ToolbarRouterContextProvider({children}: {children: React.ReactNode}) {
  // TODO: if state gets more complex, we can swtich to useReducer
  const [state, setState] = useState<State>({activePanel: null});

  const setActivePanel = useCallback(
    (activePanel: State['activePanel']) => {
      setState(prev => ({
        ...prev,
        activePanel,
      }));
    },
    [setState]
  );

  return <Context value={{setActivePanel, state}}>{children}</Context>;
}

export default function useToolbarRoute() {
  return useContext(Context);
}
