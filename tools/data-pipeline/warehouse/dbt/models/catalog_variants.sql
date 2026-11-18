select variant_id, coalesce(model_name, external_id) as model_name, brand, coalesce(category,'unknown') as category, source, source_url, observed_at, observed_price_vnd,
 jsonb_build_object(
   'variantId', variant_id, 'familyId', variant_id, 'modelName', coalesce(model_name, external_id), 'brand', brand, 'category', coalesce(category,'unknown'),
   'factIds', '[]'::jsonb,
   'specifications', jsonb_build_object(
     'ramGb', case when ram_gb > 0 then ram_gb end, 'storageGb',case when storage_gb > 0 then storage_gb end,
     'cpu',coalesce(nullif(payload#>>'{specs,cpu}',''),'Chưa xác minh'),
     'os',coalesce(nullif(payload#>>'{specs,os}',''),'Chưa xác minh'),
     'gpu',coalesce(nullif(payload#>>'{specs,gpu}',''),'')
   ),
   'sourceUrl',source_url, 'observedAt',observed_at, 'observedPriceVnd',observed_price_vnd,
   'dataStatus','reference_only', 'catalogAdmission','automatic',
   'qualityIssues',coalesce(payload->'qualityIssues','[]'::jsonb)
 ) as variant
from {{ ref('stg_products') }}
