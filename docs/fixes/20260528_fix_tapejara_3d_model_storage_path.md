# Fix Mapa 3D Tapejara — Storage path migration (2026-05-28)

## Problema
Projeto Tapejara
- project_id: `ef9e2b1a-c1ff-4189-a655-99a925961460`
- company_id: `1660b1d1-7e60-4c44-9623-bbafdfd88a71`
- Arquivo: `1772486585475.gltf`

O GLTF estava no bucket `3d-models` no padrão antigo
`project_id/gltf/<file>`, enquanto a RLS atual exige
`company_id/project_id/gltf/<file>`. `createSignedUrl` retornava 404
e o viewer caía em "Importe um modelo 3D...".

## Correção (não-destrutiva)
1. **Storage** (via edge function `copy-3d-asset` com service_role):
   copiou
   ```
   3d-models/ef9e2b1a-c1ff-4189-a655-99a925961460/gltf/1772486585475.gltf
   →
   3d-models/1660b1d1-7e60-4c44-9623-bbafdfd88a71/ef9e2b1a-c1ff-4189-a655-99a925961460/gltf/1772486585475.gltf
   ```
   Arquivo antigo **preservado**.

2. **Banco** (data update aplicado via supabase--insert; não é mudança de schema):
   ```sql
   UPDATE public.map_layouts
   SET model_3d_url = replace(
         model_3d_url,
         'ef9e2b1a-c1ff-4189-a655-99a925961460/gltf/1772486585475.gltf',
         '1660b1d1-7e60-4c44-9623-bbafdfd88a71/ef9e2b1a-c1ff-4189-a655-99a925961460/gltf/1772486585475.gltf'
       ),
       updated_at = now()
   WHERE project_id = 'ef9e2b1a-c1ff-4189-a655-99a925961460'
     AND model_3d_url LIKE '%ef9e2b1a-c1ff-4189-a655-99a925961460/gltf/1772486585475.gltf%';
   ```

## Não tocado
`project_model_meshes`, `map_mesh_house_assignments`, `map_layer_stage_links`,
`houses`, `productions`, `weekly_productions`, `diary_items`, PLE, notificações.

Nenhum arquivo de outros projetos foi alterado no Storage.
