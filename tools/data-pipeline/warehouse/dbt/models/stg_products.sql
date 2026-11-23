with ranked as (
 select *, row_number() over(partition by source,external_id order by observed_at desc,observation_id desc) as position
 from {{ source('raw','product_observations') }}
)
select observation_id, 'retailer:' || source || ':' || external_id as variant_id,
 source, external_id, observed_at, capture_mode, review_status, payload,
 nullif(payload->>'name','') as model_name,
 coalesce(nullif(payload->>'brand',''),'Chưa xác minh') as brand,
 payload->>'url' as source_url,
 case when payload->>'url' ~* '/(samsung-galaxy-tab|lenovo-tab|xiaomi-pad|redmi-pad|oppo-pad|honor-pad|huawei-matepad|google-pixel-tablet)(-|/|$)' then 'tablet'
 when payload->>'url' ~* '/(samsung-galaxy-book|huawei-matebook|honor-magicbook|xiaomi-book)(-|/|$)' then 'pc_laptop'
 else coalesce(payload->>'category', case when exists (
   select 1 from jsonb_array_elements(coalesce(payload->'categories','[]'::jsonb)) c
   where c->>'slug' in ('laptop','may-tinh-xach-tay','may-doi-tra-laptop')
 ) then 'pc_laptop' end) end as category,
 (regexp_match(payload#>>'{specs,ram}', '^\s*([0-9]{1,4})\s*[Gg][Bb]'))[1]::integer as ram_gb,
 {{ storage_gb("payload#>>'{specs,storage}'") }} as storage_gb,
 case when payload#>>'{pricing,current}' ~ '^[0-9]{1,15}$' then (payload#>>'{pricing,current}')::bigint else null end as observed_price_vnd
from ranked where position=1
