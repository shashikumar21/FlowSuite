import { z } from 'zod'

export const businessSchema = z.object({
  name: z.string().trim().min(2, 'Enter your business name'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  industry: z.string().min(1, 'Choose an industry'),
  email: z.union([z.string().email('Enter a valid email address'), z.literal('')]).optional(),
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\+?[0-9][0-9\s-]{6,14}$/.test(value), 'Enter a valid phone number')
    .optional(),
})

export type BusinessValues = z.infer<typeof businessSchema>
