

## Plano: Sistema de Anexos de Arquivos nos Documentos das Obras

### Objetivo
Permitir que usuários façam upload de arquivos (PDFs, imagens, etc.) vinculados a cada documento do checklist de uma obra. Outros usuários com acesso podem visualizar e baixar esses arquivos.

### Arquitetura

```text
┌─────────────────────┐
│ holding_obra_docs    │  (já existe — checklist por obra)
│   id (PK)           │
│   obra_id            │
│   doc_tipo_id        │
│   checked            │
└────────┬────────────┘
         │ 1:N
┌────────▼────────────┐
│ holding_doc_files    │  (NOVA tabela)
│   id (PK)           │
│   obra_doc_id (FK)  │  → holding_obra_docs.id
│   file_name          │
│   file_path          │  → caminho no Storage
│   file_size           │
│   content_type        │
│   uploaded_by (FK)   │  → auth.users.id
│   uploaded_by_name    │
│   created_at          │
└──────────────────────┘