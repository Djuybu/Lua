select variant_id from {{ ref('catalog_variants') }}
where (variant#>>'{specifications,ramGb}')::integer <= 0
 or (variant#>>'{specifications,storageGb}')::integer <= 0
 or observed_price_vnd < 0
