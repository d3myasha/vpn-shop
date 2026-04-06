-- Allow Telegram-only accounts without synthetic local emails.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
