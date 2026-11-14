/**
 * Taxonomy and Profile Contracts for Lua Device Adviser
 * Defines valid categories, purposes, priorities, and validation rules.
 */

export type DeviceCategory = 'phone' | 'tablet' | 'pc_laptop' | 'pc_desktop';

export const VALID_CATEGORIES: readonly DeviceCategory[] = [
  'phone',
  'tablet',
  'pc_laptop',
  'pc_desktop'
] as const;

export const CATEGORY_PURPOSES: Record<DeviceCategory, readonly string[]> = {
  phone: [
    'phone_daily_comms',
    'phone_photography',
    'phone_gaming_heavy',
    'phone_battery_longevity',
    'phone_compact_mobility'
  ],
  tablet: [
    'tablet_drawing_creative',
    'tablet_study_reading',
    'tablet_media_entertainment',
    'tablet_light_office',
    'tablet_compact_travel'
  ],
  pc_laptop: [
    'laptop_office_study',
    'laptop_software_dev',
    'laptop_graphic_video',
    'laptop_gaming_aaa',
    'laptop_ultraportable'
  ],
  pc_desktop: [
    'desktop_software_dev_vm',
    'desktop_gaming_stream',
    'desktop_3d_render',
    'desktop_home_office'
  ]
} as const;

export const VALID_PRIORITIES = [
  'priority_budget_savings',
  'priority_performance_cpu',
  'priority_graphics_gpu',
  'priority_battery_life',
  'priority_display_quality',
  'priority_portability_weight',
  'priority_build_durability',
  'priority_warranty_support',
  'priority_upgradeability',
  'priority_quiet_cooling'
] as const;

export type AdviserPriority = typeof VALID_PRIORITIES[number];

export interface HardConstraints {
  requiredOs?: readonly string[];
  minRamGb?: number;
  maxWeightKg?: number;
  formFactor?: string;
}

export interface ConfirmedNeedsProfile {
  category: DeviceCategory;
  /** Exactly 3 distinct, ordered purposes */
  orderedPurposes: readonly [string, string, string];
  /** Exactly 3 distinct, ordered priorities */
  orderedPriorities: readonly [string, string, string];
  budget: {
    hardCeilingVnd: number;
    preferredBand?: readonly [number, number];
  };
  hardConstraints?: HardConstraints;
}

export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a confirmed profile according to BRD and Agent 1 review:
 * - Category must be supported.
 * - orderedPurposes must contain exactly 3 distinct, valid values for that category.
 * - orderedPriorities must contain exactly 3 distinct, valid priorities.
 * - hardCeilingVnd must be a safe, positive integer.
 */
export function validateConfirmedProfile(profile: unknown): ProfileValidationResult {
  const errors: string[] = [];
  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Profile must be a non-null object'] };
  }

  const p = profile as Partial<ConfirmedNeedsProfile>;

  // 1. Category validation
  if (!p.category || !VALID_CATEGORIES.includes(p.category)) {
    errors.push(`Invalid category: ${p.category}. Allowed: ${VALID_CATEGORIES.join(', ')}`);
  }

  // 2. Purposes validation
  if (!Array.isArray(p.orderedPurposes) || p.orderedPurposes.length !== 3) {
    errors.push('orderedPurposes must contain exactly 3 items');
  } else {
    const uniquePurposes = new Set(p.orderedPurposes);
    if (uniquePurposes.size !== 3) {
      errors.push('orderedPurposes must not contain duplicates');
    }
    if (p.category && VALID_CATEGORIES.includes(p.category)) {
      const allowed = CATEGORY_PURPOSES[p.category];
      for (const purp of p.orderedPurposes) {
        if (!allowed.includes(purp)) {
          errors.push(`Purpose '${purp}' is not allowed for category '${p.category}'`);
        }
      }
    }
  }

  // 3. Priorities validation
  if (!Array.isArray(p.orderedPriorities) || p.orderedPriorities.length !== 3) {
    errors.push('orderedPriorities must contain exactly 3 items');
  } else {
    const uniquePriorities = new Set(p.orderedPriorities);
    if (uniquePriorities.size !== 3) {
      errors.push('orderedPriorities must not contain duplicates');
    }
    for (const prio of p.orderedPriorities) {
      if (!VALID_PRIORITIES.includes(prio as AdviserPriority)) {
        errors.push(`Invalid priority: '${prio}'`);
      }
    }
  }

  // 4. Budget validation
  if (!p.budget || typeof p.budget !== 'object') {
    errors.push('budget object is required');
  } else {
    if (
      typeof p.budget.hardCeilingVnd !== 'number' ||
      !Number.isSafeInteger(p.budget.hardCeilingVnd) ||
      p.budget.hardCeilingVnd <= 0
    ) {
      errors.push('budget.hardCeilingVnd must be a positive safe integer');
    }
    if (p.budget.preferredBand !== undefined) {
      if (
        !Array.isArray(p.budget.preferredBand) ||
        p.budget.preferredBand.length !== 2 ||
        !Number.isSafeInteger(p.budget.preferredBand[0]) ||
        !Number.isSafeInteger(p.budget.preferredBand[1]) ||
        p.budget.preferredBand[0] < 0 ||
        p.budget.preferredBand[1] < p.budget.preferredBand[0]
      ) {
        errors.push('budget.preferredBand must be a valid [min, max] safe integer range');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
