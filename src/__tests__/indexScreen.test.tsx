import React from 'react';
import { render } from '@testing-library/react-native';
import IndexScreen from '../app/index';

const mockUsePathname = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const ReactLib = require('react');
    const { Text } = require('react-native');
    return <Text testID="mock-redirect">{href}</Text>;
  },
  usePathname: () => mockUsePathname(),
}));

describe('IndexScreen route safeguards', () => {
  it('redirects to /feed when pathname is root "/"', async () => {
    mockUsePathname.mockReturnValue('/');
    const { getByTestId, queryByText } = await render(<IndexScreen />);
    expect(getByTestId('mock-redirect')).toBeTruthy();
    expect(queryByText('/feed')).toBeTruthy();
  });

  it('redirects to /feed when pathname is "/index"', async () => {
    mockUsePathname.mockReturnValue('/index');
    const { getByTestId, queryByText } = await render(<IndexScreen />);
    expect(getByTestId('mock-redirect')).toBeTruthy();
    expect(queryByText('/feed')).toBeTruthy();
  });

  it('does NOT redirect when pathname is a non-root route like "/channel/UC_123"', async () => {
    mockUsePathname.mockReturnValue('/channel/UC_123');
    const { queryByTestId } = await render(<IndexScreen />);
    expect(queryByTestId('mock-redirect')).toBeNull();
  });
});
