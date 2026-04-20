-- 1. Adicionar campos de localização em projects para clima automático
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS estado    TEXT DEFAULT 'RS',
  ADD COLUMN IF NOT EXISTS lat       NUMERIC,
  ADD COLUMN IF NOT EXISTS lng       NUMERIC;

-- 2. Healing das duas divergências históricas no projeto Tapejara:
-- 2a. Casa 37 - "Prumadas de água": Mapa marca 100% mas não há registro ativo → zerar
UPDATE public.houses
SET macros = (
  SELECT jsonb_agg(
    CASE WHEN (m.elem->>'name') = 'PAREDES E LAJES'
      THEN jsonb_set(
        m.elem,
        '{scopes}',
        (
          SELECT jsonb_agg(
            CASE WHEN (s.elem->>'name') = 'Prumadas de água'
              THEN jsonb_set(s.elem, '{progress}', '0'::jsonb)
              ELSE s.elem
            END
          )
          FROM jsonb_array_elements(m.elem->'scopes') AS s(elem)
        )
      )
      ELSE m.elem
    END
  )
  FROM jsonb_array_elements(macros) AS m(elem)
),
last_update = CURRENT_DATE
WHERE project_id = 'ef9e2b1a-c1ff-4189-a655-99a925961460'::uuid
  AND house_number = 37;

-- 2b. Casa 2 - "Impermeabilização Box": Planejamento tem mas Mapa não → marcar 100%
UPDATE public.houses
SET macros = (
  SELECT jsonb_agg(
    CASE WHEN (m.elem->>'name') = 'IMPERMEABILIZAÇÃO'
      THEN jsonb_set(
        m.elem,
        '{scopes}',
        (
          SELECT jsonb_agg(
            CASE WHEN (s.elem->>'name') = 'Impermeabilização Box'
              THEN jsonb_set(s.elem, '{progress}', '100'::jsonb)
              ELSE s.elem
            END
          )
          FROM jsonb_array_elements(m.elem->'scopes') AS s(elem)
        )
      )
      ELSE m.elem
    END
  )
  FROM jsonb_array_elements(macros) AS m(elem)
),
last_update = CURRENT_DATE
WHERE project_id = 'ef9e2b1a-c1ff-4189-a655-99a925961460'::uuid
  AND house_number = 2;