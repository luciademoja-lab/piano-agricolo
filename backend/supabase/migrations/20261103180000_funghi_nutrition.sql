-- Il catalogo pubblico mostra anche i valori nutrizionali (per 100 g, con la loro fonte).
-- Le indicazioni ("fonte di fibre", frasi sulla salute) le calcola il frontend da questi numeri,
-- con le soglie di legge (frontend/src/lib/nutrition.ts).
create or replace function public.catalog_public()
returns table (id text, "position" int, data jsonb, list_wholesale numeric, list_retail numeric, list_updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.id, v.position,
    jsonb_build_object(
      'commonName', v.data -> 'commonName', 'scientificName', v.data -> 'scientificName', 'otherNames', v.data -> 'otherNames',
      'kitchen', v.data -> 'kitchen', 'photo', v.data -> 'photo',
      'shipDays', v.data -> 'shipDays', 'incubationDays', v.data -> 'incubationDays', 'firstHarvestDays', v.data -> 'firstHarvestDays',
      'nutrition', v.data -> 'nutrition'
    ),
    v.list_wholesale, v.list_retail, v.list_updated_at
  from public.varieties v
  where v.public and v.data ->> 'legal' = 'ammesso'
  order by v.position, v.id
$$;

revoke execute on function public.catalog_public() from public;
grant execute on function public.catalog_public() to anon, authenticated;
