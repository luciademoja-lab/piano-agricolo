-- Valori nutrizionali delle varietà, generati da backend/supabase/seed/funghi_nutrition_v1.json
-- con `npm run funghi:sql`. Non modificarlo a mano: cambia il JSON e rigeneralo.
-- Si aggiungono solo dove mancano: le modifiche fatte dall'admin restano.
update public.varieties v set data = v.data || jsonb_build_object('nutrition', n.nutrition)
from (values
  ('pleurotus-ostreatus', '{"per100g":{"kcal":33,"protein":3.31,"fat":0.41,"fiber":2.3,"potassium":420,"phosphorus":120,"copper":0.24,"selenium":2.6,"niacin":4.96,"riboflavin":0.35,"pantothenic":1.29,"folate":38,"b6":0.11},"source":{"text":"USDA FoodData Central, SR Legacy, \"Mushrooms, oyster, raw\" (FDC 168580)","url":"https://getfoodfacts.com/food/mushrooms-oyster-raw-168580","date":"2026-11-03"}}'::jsonb),
  ('cardoncello', '{"per100g":{"kcal":38.5,"protein":2,"fat":null,"fiber":3,"potassium":290,"phosphorus":null,"copper":null,"selenium":null,"niacin":6.5,"riboflavin":0.24,"pantothenic":null,"folate":null,"b6":null},"source":{"text":"USDA FoodData Central, Foundation Foods, \"Mushroom, king oyster\" (FDC 2003599), valori arrotondati riportati da getfoodfacts","url":"https://getfoodfacts.com/food/mushroom-king-oyster-2003599","date":"2026-11-03"},"approximate":true}'::jsonb),
  ('pioppino', '{"per100g":{"kcal":31,"protein":3.5,"fat":0.24,"fiber":2.8,"potassium":392,"phosphorus":121,"copper":null,"selenium":4.1,"niacin":6,"riboflavin":null,"pantothenic":null,"folate":null,"b6":null},"source":{"text":"USDA FoodData Central, Foundation Foods, \"Mushroom, pioppini\" (FDC 2003604)","url":"https://getfoodfacts.com/food/mushroom-pioppini-2003604","date":"2026-11-03"}}'::jsonb),
  ('shiitake', '{"per100g":{"kcal":34,"protein":2.24,"fat":0.49,"fiber":2.5,"potassium":304,"phosphorus":112,"copper":0.142,"selenium":5.7,"niacin":3.877,"riboflavin":0.217,"pantothenic":1.5,"folate":13,"b6":0.293},"source":{"text":"USDA National Nutrient Database, \"Mushrooms, shiitake, raw\", riportato da nutritionvalue.org","url":"https://www.nutritionvalue.org/Mushrooms%2C_raw%2C_shiitake_nutritional_value.html","date":"2026-11-03"}}'::jsonb)
) as n(id, nutrition)
where v.id = n.id and not (v.data ? 'nutrition');
