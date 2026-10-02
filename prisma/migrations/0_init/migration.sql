-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "email" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "player_name" TEXT NOT NULL,
    "player_email" TEXT NOT NULL,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tee_times" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "course" TEXT,
    "pairing" TEXT,
    "commissioner" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tee_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foursomes" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "group_number" INTEGER NOT NULL,
    "players" TEXT[],
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foursomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_interest" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "player_email" TEXT NOT NULL,
    "notes" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "setting_key" TEXT NOT NULL,
    "setting_value" TEXT NOT NULL,
    "description" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_player_name_key" ON "users"("player_name");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "availability_date_idx" ON "availability"("date");

-- CreateIndex
CREATE INDEX "availability_player_email_idx" ON "availability"("player_email");

-- CreateIndex
CREATE INDEX "tee_times_date_idx" ON "tee_times"("date");

-- CreateIndex
CREATE INDEX "foursomes_date_idx" ON "foursomes"("date");

-- CreateIndex
CREATE INDEX "player_interest_date_idx" ON "player_interest"("date");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_setting_key_key" ON "app_settings"("setting_key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

