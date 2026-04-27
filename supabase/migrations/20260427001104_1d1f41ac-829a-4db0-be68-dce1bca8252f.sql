ALTER TABLE public.diary_photos
  ADD COLUMN IF NOT EXISTS house_number integer,
  ADD COLUMN IF NOT EXISTS categoria text;

CREATE INDEX IF NOT EXISTS idx_diary_photos_house
  ON public.diary_photos (diary_entry_id, house_number)
  WHERE house_number IS NOT NULL;

COMMENT ON COLUMN public.diary_photos.house_number IS 'Casa específica do lançamento à qual a foto pertence. NULL = vale para todas as casas do item ou foto avulsa.';
COMMENT ON COLUMN public.diary_photos.categoria IS 'Categoria opcional para fotos avulsas (sem diary_item_id): retrabalho, ocorrencia, geral, etc.';