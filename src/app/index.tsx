import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Redirección inicial a la pestaña principal Feed.
 */
export default function IndexScreen() {
  return <Redirect href="/feed" />;
}
