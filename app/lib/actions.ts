'use server';

import { z } from 'zod';
import { Pool } from 'pg';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

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
const UpdateInvoice = FormSchema.omit({ date: true, id: true });

export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
    const validatedFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Create Invoice.',
        };
    }

    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    try {
        const client = await pool.connect();
        try {
            await client.query(
                'INSERT INTO invoices (customer_id, amount, status, date) VALUES ($1, $2, $3, $4)',
                [customerId, amountInCents, status, date]
            );
        } finally {
            client.release();
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Database Error:', error);
        }
        return {
            message: 'Database Error: Failed to Create Invoice.',
        };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function updateInvoice(
    id: string,
    prevState: State,
    formData: FormData
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
        const client = await pool.connect();
        try {
            await client.query(
                'UPDATE invoices SET customer_id = $1, amount = $2, status = $3 WHERE id = $4',
                [customerId, amountInCents, status, id]
            );
        } finally {
            client.release();
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Database Error:', error);
        }
        return { message: 'Database Error: Failed to Update Invoice.' };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
    try {
        const client = await pool.connect();
        try {
            await client.query('DELETE FROM invoices WHERE id = $1', [id]);
        } finally {
            client.release();
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Database Error:', error);
        }
        return { message: 'Database Error: Failed to Delete Invoice.' };
    }

    revalidatePath('/dashboard/invoices');
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData
) {
    try {
        if (process.env.NODE_ENV !== 'production') {
            console.log('Signing in with credentials', formData);
        }
        await signIn('credentials', formData);
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Failed to sign in', error);
        }
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
