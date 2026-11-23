select variant_id from {{ ref('catalog_variants') }}
where (source_url ~* '/(samsung-galaxy-tab|lenovo-tab|xiaomi-pad|redmi-pad|oppo-pad|honor-pad|huawei-matepad|google-pixel-tablet)(-|/|$)' and category <> 'tablet')
 or (source_url ~* '/(samsung-galaxy-book|huawei-matebook|honor-magicbook|xiaomi-book)(-|/|$)' and category <> 'pc_laptop')
