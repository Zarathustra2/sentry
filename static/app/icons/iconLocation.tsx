import {Fragment} from 'react';
import {useTheme} from '@emotion/react';

import type {SVGIconProps} from './svgIcon';
import {SvgIcon} from './svgIcon';

function IconLocation(props: SVGIconProps) {
  const theme = useTheme();
  return (
    <SvgIcon {...props} kind={theme.isChonk ? 'stroke' : 'path'}>
      {theme.isChonk ? (
        <Fragment>
          <path d="m12.75,6.5c0,4.5-4.75,7.75-4.75,7.75,0,0-4.75-3.25-4.75-7.75,0-2.49,2.13-4.5,4.75-4.5s4.75,2.01,4.75,4.5Z" />
          <circle cx="8" cy="6.75" r="1.75" />
        </Fragment>
      ) : (
        <Fragment>
          <path d="M8,16a.74.74,0,0,1-.45-.15c-4-3-6.09-6.16-6.09-9.29A6.55,6.55,0,0,1,8,0a6.54,6.54,0,0,1,6.54,6.54c0,3.14-2,6.26-6.09,9.29A.74.74,0,0,1,8,16ZM8,1.51a5,5,0,0,0-5,5c0,2.53,1.69,5.13,5,7.74,3.34-2.61,5-5.21,5-7.74a5,5,0,0,0-5-5Z" />
          <path d="M8,8.85a2.78,2.78,0,1,1,2.77-2.77A2.78,2.78,0,0,1,8,8.85Zm0-4A1.28,1.28,0,1,0,9.27,6.08,1.27,1.27,0,0,0,8,4.8Z" />
        </Fragment>
      )}
    </SvgIcon>
  );
}

IconLocation.displayName = 'IconLocation';

export {IconLocation};
