import React from 'react';
import { Redirect, usePathname } from 'expo-router';

/**
 * Redirección inicial a la pestaña principal Feed.
 * Solo redirige cuando la ruta actual es exactamente la raíz para evitar rebotes indeseados.
 */
export default function IndexScreen() {
  const pathname = usePathname();
  if (!pathname || pathname === '/' || pathname === '/index') {
    return <Redirect href="/feed" />;
  }
  return null;
}
