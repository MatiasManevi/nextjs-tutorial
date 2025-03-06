'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { z } from 'zod';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export type State = {
	errors?: {
		customerId?: string[];
		amount?: string[];
		status?: string[];
	};
	message?: string | null;
};

const FormSchema = z.object({
	id: z.string(),
	customerId: z.string({
		invalid_type_error: 'Please select a customer.',
	}),
	amount: z.coerce
		.number()
		.gt(0, { message: 'Please enter an amount greater than $0.' }),
	status: z.enum(['pending', 'paid'], {
		invalid_type_error: 'Please select an invoice status.',
	}),
	date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function deleteInvoice(id: string) {
	try {
		await sql`DELETE FROM invoices WHERE i = ${id}`;
		revalidatePath('/dashboard/invoices');
	} catch (error) {
		// We'll log the error to the console for now
		console.error(error);
	}
}

export async function updateInvoice(
	id: string,
	prevState: State,
	formData: FormData,
) {
	const validatedFields = UpdateInvoice.safeParse({
		customerId: formData.get('customerId'),
		amount: formData.get('amount'),
		status: formData.get('status'),
	});

	if (!validatedFields.success) {
		return {
			errors: validatedFields.error.flatten().fieldErrors,
			message: 'Missing Fields. Failed to Update Invoice.',
		};
	}

	const { customerId, amount, status } = validatedFields.data;
	const amountInCents = amount * 100;

	try {
		await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
	} catch (error) {
		return { message: 'Database Error: Failed to Update Invoice.' };
	}

	revalidatePath('/dashboard/invoices');
	redirect('/dashboard/invoices');
}

export async function createInvoice(prevState: State, formData: FormData) {
	try {
		const validatedFields = CreateInvoice.safeParse({
			customerId: formData.get('customerId'),
			amount: formData.get('amount'),
			status: formData.get('status'),
		});

		// If form validation fails, return errors early. Otherwise, continue.
		if (!validatedFields.success) {
			return {
				errors: validatedFields.error.flatten().fieldErrors,
				message: 'Missing Fields. Failed to Create Invoice.',
			};
		}

		const { customerId, amount, status } = validatedFields.data;
		const amountInCents = amount * 100;
		const date = new Date().toISOString().split('T')[0];
		// Test it out:
		console.log({ date, customerId, amount, amountInCents, status });
		await sql`
			INSERT INTO invoices (customer_id, amount, status, date)
			VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
		`;

		revalidatePath('/dashboard/invoices');
	} catch (error) {
		// We'll log the error to the console for now
		console.error(error);
	}
	redirect('/dashboard/invoices');
}

export async function authenticate(
	prevState: string | undefined,
	formData: FormData,
) {
	try {
		await signIn('credentials', formData);
	} catch (error) {
		if (error instanceof AuthError) {
			switch (error.type) {
				case 'CredentialsSignin':
					return 'Invalid credentials.';
				default:
					return 'Something went wrong.';
			}
		}
		throw error;
	}
}
