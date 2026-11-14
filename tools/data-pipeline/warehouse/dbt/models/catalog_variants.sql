select variant_id, model_name, brand, category, source, source_url, observed_at, observed_price_vnd,
 jsonb_build_object(
   'variantId', variant_id, 'familyId', variant_id, 'modelName', model_name, 'brand', brand, 'category', category,
   'factIds', '[]'::jsonb,
   'specifications', jsonb_strip_nulls(jsonb_build_object(
     'ramGb', ram_gb, 'storageGb',storage_gb,
     'cpu',coalesce(nullif(payload#>>'{specs,cpu}',''),'Chưa xác minh'),
     'os',coalesce(nullif(payload#>>'{specs,os}',''),'Chưa xác minh'),
     'gpu',nullif(payload#>>'{specs,gpu}','')
   )),
   'sourceUrl',source_url, 'observedAt',observed_at, 'observedPriceVnd',observed_price_vnd,
   'dataStatus','reference_only'
 ) as variant
from {{ ref('stg_products') }}
where model_name is not null and category in ('phone','tablet','pc_laptop','pc_desktop')
 and ram_gb > 0 and storage_gb > 0 and review_status <> 'quarantine'
 and source_url ~ '^https://'
