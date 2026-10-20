import { z } from "zod";
import {
  CUSTOM_FIELD_TYPES,
  MAX_OPTIONS,
  isOptionField,
  type CustomFieldType,
} from "../app/data/customFields";
import { resolveJqlField } from "../app/data/jql";
import { isValidTypeKey } from "../app/data/workflow";

const optionSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    value: z.string().trim().min(1, "Option names cannot be empty").max(120),
    disabled: z.boolean().optional(),
  })
  .strict();

const issueTypesSchema = z
  .array(
    z
      .string()
      .trim()
      .max(80)
      .refine(isValidTypeKey, { message: "Unknown work type" }),
  )
  .max(50)
  .transform((keys) => [...new Set(keys)]);

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the field a name")
  .max(80)
  .refine((name) => !resolveJqlField(name), {
    message: "This name is used by a system field. Choose another name.",
  })
  .refine((name) => !/^cf\[/i.test(name), { message: "Choose another name" });

const descriptionSchema = z.string().trim().max(500).nullable();

type OptionInput = z.infer<typeof optionSchema>;

function checkOptions(
  type: CustomFieldType | undefined,
  options: OptionInput[] | undefined,
  context: z.RefinementCtx,
) {
  if (!options) return;
  if (type && !isOptionField(type) && options.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["options"],
      message: "Only select, checkbox and radio fields have options",
    });
    return;
  }
  const seen = new Set<string>();
  for (const option of options) {
    const key = option.value.toLowerCase();
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: `The option '${option.value}' is listed twice`,
      });
      return;
    }
    seen.add(key);
  }
}

export const createCustomFieldSchema = z
  .object({
    name: nameSchema,
    type: z.enum(CUSTOM_FIELD_TYPES),
    description: descriptionSchema.optional(),
    required: z.boolean().optional(),
    options: z.array(optionSchema).max(MAX_OPTIONS).optional(),
    issueTypes: issueTypesSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    checkOptions(input.type, input.options, context);
    if (isOptionField(input.type) && !(input.options ?? []).some((option) => !option.disabled)) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Add at least one option",
      });
    }
  });

export const updateCustomFieldSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    required: z.boolean().optional(),
    options: z.array(optionSchema).max(MAX_OPTIONS).optional(),
    issueTypes: issueTypesSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => checkOptions(undefined, input.options, context))
  .refine((input) => Object.keys(input).length > 0, {
    message: "Provide at least one field setting to update",
  });

export const reorderCustomFieldsSchema = z
  .object({
    ids: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
  })
  .strict();

/** Issue create/update payload: { [fieldId or field name]: value | null }. */
export const customFieldValueSchema = z.union([
  z.string().max(20000),
  z.number(),
  z.array(z.string().max(200)).max(100),
  z.null(),
]);

export const customFieldValuesInputSchema = z
  .record(z.string().trim().min(1).max(120), customFieldValueSchema)
  .refine((values) => Object.keys(values).length <= 100, {
    message: "Too many custom field values",
  });

export const bulkSetCustomFieldSchema = z
  .object({
    issueIds: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(200)
      .transform((ids) => [...new Set(ids)]),
    fieldId: z.string().trim().min(1).max(120),
    value: customFieldValueSchema,
  })
  .strict();

export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
