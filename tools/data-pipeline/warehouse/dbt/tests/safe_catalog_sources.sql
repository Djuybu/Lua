select variant_id from {{ ref('catalog_variants') }}
where source_url !~ '^https://(www\.)?(cellphones\.com\.vn|thegioididong\.com|dienmayxanh\.com|fptshop\.com\.vn|laptopaz\.vn|trungtran\.vn|shopdunk\.com|onewaymobile\.vn)/'
