
-- Create a function to rename a house number across ALL tables
CREATE OR REPLACE FUNCTION public.rename_house_number(
  p_project_id UUID,
  p_old_number INTEGER,
  p_new_number INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Update houses table
  UPDATE houses 
  SET house_number = p_new_number 
  WHERE project_id = p_project_id AND house_number = p_old_number;

  -- 2. Update quadras house_ids arrays
  UPDATE quadras
  SET house_ids = array_replace(house_ids, p_old_number, p_new_number)
  WHERE project_id = p_project_id AND p_old_number = ANY(house_ids);

  -- 3. Update map_layouts houses JSON array
  UPDATE map_layouts
  SET houses = (
    SELECT jsonb_agg(
      CASE 
        WHEN (elem->>'id')::int = p_old_number 
        THEN jsonb_set(elem, '{id}', to_jsonb(p_new_number))
        ELSE elem
      END
    )
    FROM jsonb_array_elements(houses::jsonb) AS elem
  )
  WHERE project_id = p_project_id;

  -- 4. Update productions house_ids arrays
  UPDATE productions
  SET house_ids = array_replace(house_ids, p_old_number, p_new_number)
  WHERE project_id = p_project_id AND p_old_number = ANY(house_ids);

  -- 5. Update weekly_productions house_ids arrays
  UPDATE weekly_productions
  SET house_ids = array_replace(house_ids, p_old_number, p_new_number)
  WHERE project_id = p_project_id AND p_old_number = ANY(house_ids);

  -- 6. Update planned_productions planned_house_ids arrays
  UPDATE planned_productions
  SET planned_house_ids = array_replace(planned_house_ids, p_old_number, p_new_number)
  WHERE project_id = p_project_id AND p_old_number = ANY(planned_house_ids);

  -- 7. Update measurement_services planned_house_ids arrays
  UPDATE measurement_services
  SET planned_house_ids = array_replace(planned_house_ids, p_old_number, p_new_number)
  WHERE project_id = p_project_id AND p_old_number = ANY(planned_house_ids);

  -- 8. Update daily_work_logs house_ids arrays
  UPDATE daily_work_logs
  SET house_ids = array_replace(house_ids, p_old_number, p_new_number)
  WHERE project_id = p_project_id AND p_old_number = ANY(house_ids);

  -- 9. Update map_layouts house_markers_3d JSON if exists
  UPDATE map_layouts
  SET house_markers_3d = (
    SELECT jsonb_agg(
      CASE 
        WHEN (elem->>'id')::int = p_old_number 
        THEN jsonb_set(elem, '{id}', to_jsonb(p_new_number))
        ELSE elem
      END
    )
    FROM jsonb_array_elements(house_markers_3d::jsonb) AS elem
  )
  WHERE project_id = p_project_id AND house_markers_3d IS NOT NULL;

  RETURN TRUE;
END;
$$;
