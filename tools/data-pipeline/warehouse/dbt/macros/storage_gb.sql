{% macro storage_gb(expression) %}
{# Ignore parenthesized upgrade limits; prefer capacity attached to SSD/HDD.
   Bare capacity and eMMC prefixes are accepted only at the start. #}
(case when regexp_replace({{ expression }}, '\([^)]*\)', '', 'g') ~* '[0-9]\s*TB\s*(SSD|HDD)'
 then ((regexp_match(regexp_replace({{ expression }}, '\([^)]*\)', '', 'g'), '(?i)([0-9]{1,4}(?:\.[0-9]+)?)\s*TB\s*(?:SSD|HDD)'))[1]::numeric * 1024)::integer
 else coalesce(
   (regexp_match(regexp_replace({{ expression }}, '\([^)]*\)', '', 'g'), '(?i)([0-9]{1,6})\s*GB\s*(?:SSD|HDD)'))[1]::integer,
   (regexp_match({{ expression }}, '(?i)^\s*[•-]?\s*(?:eMMC\s*)?([0-9]{1,6})\s*GB'))[1]::integer
 ) end)
{% endmacro %}
