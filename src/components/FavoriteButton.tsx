import React, { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { useThemeColors } from '../hooks/useThemeColors';

export interface FavoriteButtonProps {
  isFavorite: boolean;
  onPress: () => void;
  compact?: boolean;
  testID?: string;
}

function FavoriteButtonComponent({
  isFavorite,
  onPress,
  compact = false,
  testID,
}: FavoriteButtonProps) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      testID={testID ?? 'favorite-button'}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      accessibilityState={{ selected: isFavorite }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: isFavorite ? colors.surfaceElevated : colors.primary,
          borderColor: isFavorite ? colors.border : colors.primary,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons
        name={isFavorite ? 'checkmark-circle' : 'add-circle-outline'}
        size={config.theme.sizes.iconSm}
        color={isFavorite ? colors.text : colors.badgeText}
      />
      <Text
        style={[
          styles.label,
          {
            color: isFavorite ? colors.text : colors.badgeText,
          },
        ]}
      >
        {isFavorite ? 'Favorito' : 'Seguir'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: config.theme.spacing.md,
    height: config.theme.sizes.buttonHeight - 4,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
    gap: config.theme.spacing.xs,
  },
  buttonCompact: {
    paddingHorizontal: config.theme.spacing.sm,
    height: config.theme.sizes.buttonHeight - 8,
  },
  label: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
});

export const FavoriteButton = memo(FavoriteButtonComponent);
