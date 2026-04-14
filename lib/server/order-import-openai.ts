const DEFAULT_ORDER_IMPORT_MODEL = 'gpt-5.4-mini';

const ORDER_IMPORT_STRING_FIELDS = [
  'client_order_number',
  'client_company_name',
  'client_company_code',
  'client_vat_code',
  'client_country',
  'client_city',
  'client_postal_code',
  'client_address',
  'client_phone',
  'client_email',
  'received_from_name',
  'received_from_phone',
  'received_from_email',
  'loading_date',
  'loading_time_from',
  'loading_time_to',
  'loading_address',
  'loading_city',
  'loading_postal_code',
  'loading_country',
  'loading_contact',
  'loading_reference',
  'loading_customs_info',
  'unloading_date',
  'unloading_time_from',
  'unloading_time_to',
  'unloading_address',
  'unloading_city',
  'unloading_postal_code',
  'unloading_country',
  'unloading_contact',
  'unloading_reference',
  'unloading_customs_info',
  'shipper_name',
  'consignee_name',
  'cargo_description',
  'cargo_dimensions',
  'cargo_quantity',
  'cargo_kg',
  'cargo_ldm',
  'load_type',
  'price',
  'vat_rate',
  'currency',
  'payment_term_text',
  'payment_type',
  'notes',
] as const;

const ORDER_IMPORT_BOOLEAN_FIELDS = [
  'has_ex1',
  'has_t1',
  'has_adr',
  'has_sent',
] as const;

const ORDER_IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...ORDER_IMPORT_STRING_FIELDS, ...ORDER_IMPORT_BOOLEAN_FIELDS],
  properties: {
    ...Object.fromEntries(
      ORDER_IMPORT_STRING_FIELDS.map((field) => [
        field,
        {
          type: 'string',
        },
      ])
    ),
    ...Object.fromEntries(
      ORDER_IMPORT_BOOLEAN_FIELDS.map((field) => [
        field,
        {
          type: 'boolean',
        },
      ])
    ),
  },
};

function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server');
  }

  return apiKey;
}

function getOrderImportModel() {
  return process.env.OPENAI_ORDER_IMPORT_MODEL?.trim() || DEFAULT_ORDER_IMPORT_MODEL;
}

async function parseOpenAIError(response: Response) {
  try {
    const data = await response.json();
    const message =
      typeof data?.error?.message === 'string' && data.error.message.trim()
        ? data.error.message.trim()
        : null;

    return message || `OpenAI request failed with status ${response.status}`;
  } catch {
    return `OpenAI request failed with status ${response.status}`;
  }
}

async function uploadFileToOpenAI(params: {
  apiKey: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const formData = new FormData();
  formData.set('purpose', 'user_data');
  formData.set(
    'file',
    new Blob([params.fileBuffer], { type: params.mimeType || 'application/octet-stream' }),
    params.fileName
  );

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseOpenAIError(response));
  }

  const data = await response.json();

  if (typeof data?.id !== 'string' || data.id.trim() === '') {
    throw new Error('OpenAI file upload did not return a file id');
  }

  return data.id as string;
}

async function deleteOpenAIFile(apiKey: string, fileId: string) {
  try {
    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    // Ignore cleanup failures.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractOpenAIOutputText(data: any) {
  if (typeof data?.output_text === 'string' && data.output_text.trim() !== '') {
    return data.output_text.trim();
  }

  const outputItems = Array.isArray(data?.output) ? data.output : [];
  const textParts: string[] = [];

  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];

    for (const contentItem of contentItems) {
      if (
        contentItem?.type === 'output_text' &&
        typeof contentItem?.text === 'string' &&
        contentItem.text.trim() !== ''
      ) {
        textParts.push(contentItem.text.trim());
      }
    }
  }

  return textParts.join('\n').trim() || null;
}

function normalizeStructuredJsonText(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  return trimmed;
}

function extractStructuredOutputObject(data: any) {
  if (data?.status === 'incomplete') {
    const reason =
      typeof data?.incomplete_details?.reason === 'string'
        ? data.incomplete_details.reason
        : 'unknown';

    if (reason === 'max_output_tokens') {
      throw new Error('OpenAI extraction was incomplete because it hit the output token limit');
    }

    if (reason === 'content_filter') {
      throw new Error('OpenAI extraction was interrupted by content filtering');
    }

    throw new Error(`OpenAI extraction was incomplete (${reason})`);
  }

  const firstContent = data?.output?.[0]?.content?.[0];

  if (firstContent?.type === 'refusal') {
    throw new Error(
      typeof firstContent.refusal === 'string' && firstContent.refusal.trim() !== ''
        ? firstContent.refusal.trim()
        : 'OpenAI refused to process this import file'
    );
  }

  if (isRecord(data?.output_parsed)) {
    return data.output_parsed;
  }

  if (isRecord(firstContent?.parsed)) {
    return firstContent.parsed;
  }

  const outputText = extractOpenAIOutputText(data);

  if (!outputText) {
    throw new Error('OpenAI did not return structured extraction output');
  }

  try {
    return JSON.parse(normalizeStructuredJsonText(outputText));
  } catch (error) {
    throw new Error('OpenAI returned malformed structured JSON');
  }
}

function shouldRetryStructuredExtraction(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('max output token limit') ||
    message.includes('incomplete') ||
    message.includes('malformed structured json') ||
    message.includes('unterminated string') ||
    message.includes('unexpected end of json')
  );
}

function buildOrderImportSystemPrompt() {
  return [
    'You extract structured logistics order data from customer order documents.',
    'Return only information that is explicitly present in the file.',
    'If a field is missing or unclear, return an empty string for that field.',
    'Contracting parties and operational parties are different. Prefer the ordering customer/client company for client_company_name, not the carrier.',
    'Extract the customer order number into client_order_number.',
    'Use the legal company or registration code for client_company_code when present.',
    'Use the VAT code for client_vat_code when present.',
    'For received_from_name / phone / email, use the customer-side person who sent, signed, is represented in the contract header, or is otherwise responsible for the order.',
    'If the person is found but only company-level phone/email are present, use those company-level contact details as received_from_phone / received_from_email.',
    'shipper_name must be the actual loading company from the loading section (Loading, Pakrovimas, Zaladunek, Nadawca), not the ordering customer unless the loading section clearly shows the same company.',
    'consignee_name must be the actual unloading or delivery company from the unloading section (Unloading, Iskrovimas, Rozladunek, Odbiorca), not the ordering customer unless the unloading section clearly shows the same company.',
    'If shipper_name or consignee_name are unclear, leave them empty instead of copying the wrong contract party.',
    'Normalize dates to YYYY-MM-DD only when unambiguous. Otherwise return an empty string.',
    'Normalize time windows to 24-hour HH:MM format.',
    'If a loading time range is present, fill loading_time_from and loading_time_to.',
    'If an unloading time range is present, fill unloading_time_from and unloading_time_to.',
    'If only one loading time is present, put it into loading_time_from and leave loading_time_to empty.',
    'If only one unloading time is present, put it into unloading_time_from and leave unloading_time_to empty.',
    'For cargo_kg, cargo_ldm, and price, return plain numeric text without units or currency signs when possible.',
    'Return load_type as LTL or FTL only when explicitly present or clearly implied by phrases like FTL, full truck load, LTL, less than truck load, or full load. Otherwise return an empty string.',
    'Extract cargo dimensions into cargo_dimensions when dimensions are present, for example 120x80x190. Look for words like dimensions, measurements, size, ismatuvimai, matmenys, wymiary.',
    'Extract cargo_quantity from package count, pallet count, places, units, Vietu skaicius, ilosc, or similar wording.',
    'Extract vat_rate only when the document clearly states VAT/PVM, using only 0 or 21 without the percent sign. Otherwise return an empty string.',
    'Return currency only when clearly stated. Prefer EUR, PLN, or USD when those are explicitly present.',
    'Extract payment terms into payment_term_text. It can be a number of days or the full payment term phrase from the order.',
    'Map payment type into payment_type using one of these exact values when clearly present: bank_after_scan, bank_after_originals, cash, other. Otherwise return an empty string.',
    'Set has_ex1, has_t1, has_adr, and has_sent to true only when those markings or clear logistics synonyms are explicitly present. Otherwise return false.',
    'When EX1, T1, customs, broker, agency, celna, muitine, muitines tarpininkas, warehouse number, or terminal instructions are present near loading or unloading, capture the full operational customs or warehouse text including address, reference number, and hours inside loading_customs_info or unloading_customs_info.',
    'loading_address and unloading_address must contain only the street line of the physical loading and unloading site, for example "Ul. Radomska 76", "Sermuksniu g. 19", or "Kupiskiu str. 25-12".',
    'Do not put company names, postal codes, cities, countries, phone numbers, emails, customs broker addresses, references, terminal notes, or warehouse notes into loading_address or unloading_address.',
    'loading_address and unloading_address must be the physical loading and unloading site addresses, not the customs broker address unless customs is the physical site.',
    'loading_contact and unloading_contact should prefer the operational person plus phone or email written inside the loading or unloading block.',
    'If multiple loading or unloading points exist, put the first/main one into the dedicated fields and summarize the remaining ones in notes.',
    'Put extra operational comments, additional addresses, and uncertainty notes into notes.',
    'Be stable and consistent: for the same clear document, return the same interpretation every time.',
    'Do not guess or invent missing data.',
  ].join(' ');
}

function buildOrderImportUserPrompt(fileName: string) {
  return [
    `Extract the attached logistics order document "${fileName}" into the required schema.`,
    'Focus on client company identification, customer contact, loading/unloading, cargo, price, currency, references, customs notes, and additional comments.',
  ].join(' ');
}

export async function extractOrderImportWithOpenAI(params: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const apiKey = getOpenAIApiKey();
  const model = getOrderImportModel();
  const fileId = await uploadFileToOpenAI({
    apiKey,
    fileBuffer: params.fileBuffer,
    fileName: params.fileName,
    mimeType: params.mimeType,
  });

  try {
    const maxOutputTokenAttempts = [4000, 8000];
    let lastError: unknown = null;

    for (let attemptIndex = 0; attemptIndex < maxOutputTokenAttempts.length; attemptIndex += 1) {
      const maxOutputTokens = maxOutputTokenAttempts[attemptIndex];

      try {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            reasoning: {
              effort: 'medium',
            },
            max_output_tokens: maxOutputTokens,
            input: [
              {
                role: 'system',
                content: [
                  {
                    type: 'input_text',
                    text: buildOrderImportSystemPrompt(),
                  },
                ],
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'input_file',
                    file_id: fileId,
                  },
                  {
                    type: 'input_text',
                    text: buildOrderImportUserPrompt(params.fileName),
                  },
                ],
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'order_import_extraction',
                strict: true,
                schema: ORDER_IMPORT_SCHEMA,
              },
            },
          }),
        });

        if (!response.ok) {
          throw new Error(await parseOpenAIError(response));
        }

        const data = await response.json();
        const parsedJson = extractStructuredOutputObject(data);

        return {
          model,
          parsedJson,
          rawText: null as string | null,
        };
      } catch (error) {
        lastError = error;

        const isLastAttempt = attemptIndex === maxOutputTokenAttempts.length - 1;

        if (isLastAttempt || !shouldRetryStructuredExtraction(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to extract structured import data');
  } finally {
    await deleteOpenAIFile(apiKey, fileId);
  }
}
