import React from 'react';
import { Stack } from 'expo-router';

/**
 * Stack navigator layout for the channel profile screens.
 * Enables proper stack pushing and history behavior for dynamic /channel/[id] routes.
 */
export default function ChannelLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
