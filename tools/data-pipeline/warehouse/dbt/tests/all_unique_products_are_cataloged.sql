-- Automatic admission: every latest source identity must survive into catalog.
select s.variant_id from {{ ref('stg_products') }} s
left join {{ ref('catalog_variants') }} c using (variant_id)
where c.variant_id is null
