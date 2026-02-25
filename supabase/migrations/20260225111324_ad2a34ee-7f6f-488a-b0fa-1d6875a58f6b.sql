
-- Repair function: reconstruct house macros progress from production records
CREATE OR REPLACE FUNCTION public.repair_house_macros_from_productions(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prod RECORD;
  current_macros jsonb;
  updated_count integer := 0;
BEGIN
  FOR prod IN 
    SELECT DISTINCT scope_id, macro_id, unnest(house_ids) AS house_num
    FROM productions
    WHERE project_id = p_project_id
    UNION
    SELECT DISTINCT scope_id, macro_id, unnest(house_ids) AS house_num
    FROM weekly_productions
    WHERE project_id = p_project_id
  LOOP
    SELECT macros INTO current_macros
    FROM houses
    WHERE project_id = p_project_id AND house_number = prod.house_num;
    
    IF current_macros IS NULL THEN
      CONTINUE;
    END IF;
    
    FOR i IN 0..jsonb_array_length(current_macros) - 1 LOOP
      IF current_macros->i->>'id' = prod.macro_id THEN
        FOR j IN 0..jsonb_array_length(current_macros->i->'scopes') - 1 LOOP
          IF current_macros->i->'scopes'->j->>'id' = prod.scope_id THEN
            IF (current_macros->i->'scopes'->j->>'progress')::numeric = 0 THEN
              current_macros = jsonb_set(
                current_macros,
                ARRAY[i::text, 'scopes', j::text, 'progress'],
                '100'::jsonb
              );
              updated_count := updated_count + 1;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
    
    UPDATE houses
    SET macros = current_macros, last_update = now()::date
    WHERE project_id = p_project_id AND house_number = prod.house_num;
  END LOOP;
  
  RETURN updated_count;
END;
$$;

-- Run repair for all projects
DO $$
DECLARE
  proj RECORD;
  cnt integer;
BEGIN
  FOR proj IN SELECT id FROM projects LOOP
    SELECT public.repair_house_macros_from_productions(proj.id) INTO cnt;
    RAISE NOTICE 'Project % repaired % scope entries', proj.id, cnt;
  END LOOP;
END;
$$;
