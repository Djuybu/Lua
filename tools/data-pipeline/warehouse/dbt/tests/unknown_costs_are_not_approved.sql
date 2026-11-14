select variant_id from {{ ref('catalog_variants') }}
where variant->>'isVerifiedAffordable' = 'true'
 or variant ? 'totalVnd' or jsonb_array_length(variant->'factIds') <> 0
