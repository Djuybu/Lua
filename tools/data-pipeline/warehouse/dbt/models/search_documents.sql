select 'variant:' || variant_id as document_id, variant_id, 'variant'::text as record_type,
 model_name || ' ' || brand || ' ' || (variant#>>'{specifications,ramGb}') || 'GB RAM ' ||
 (variant#>>'{specifications,storageGb}') || 'GB SSD ' || coalesce(variant->'specifications','{}'::jsonb)::text as search_text,
 jsonb_build_object('variantId',variant_id,'recordType','variant','category',category,'source',source,
 'modelName',model_name,'sourceUrl',source_url,'observedAt',observed_at,'reviewStatus','reference_only') as payload
from {{ ref('catalog_variants') }}
union all
select 'observation:' || observation_id, variant_id, 'observation', coalesce(model_name,'') || ' ' || payload::text,
 jsonb_build_object('variantId',variant_id,'recordType','observation','source',source,'reviewStatus',review_status)
from {{ ref('stg_products') }}
