ALTER TABLE public.order_documents
  DROP CONSTRAINT IF EXISTS order_documents_mime_type_allowed;

ALTER TABLE public.order_documents
  ADD CONSTRAINT order_documents_mime_type_allowed CHECK (
    mime_type IN (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  );
