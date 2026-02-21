-- Subscriptions table and RLS. Chapters/books blocks run only if those tables exist.

-- Subscriptions: active = user can access locked chapters (free = false)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'past_due')),
  started_at timestamptz DEFAULT now(),
  end_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.subscriptions IS 'User subscriptions; status=active grants access to chapters where free = false.';

-- Only touch chapters if the table exists (e.g. you create it separately or in another migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chapters') THEN
    -- Optional columns for reader (title, content, released_at)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'title') THEN
      ALTER TABLE public.chapters ADD COLUMN title text;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'chapter_num') THEN
        EXECUTE 'UPDATE public.chapters SET title = ''Chapter '' || chapter_num WHERE title IS NULL';
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'content') THEN
      ALTER TABLE public.chapters ADD COLUMN content text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'released_at') THEN
      ALTER TABLE public.chapters ADD COLUMN released_at timestamptz DEFAULT now();
    END IF;

    ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Chapters: free are public" ON public.chapters;
    DROP POLICY IF EXISTS "Chapters: locked for active subscribers" ON public.chapters;
    CREATE POLICY "Chapters: free are public"
      ON public.chapters FOR SELECT
      USING (
        free = true
        AND (released_at IS NULL OR released_at <= now())
      );
    CREATE POLICY "Chapters: locked for active subscribers"
      ON public.chapters FOR SELECT
      USING (
        free = false
        AND (released_at IS NULL OR released_at <= now())
        AND EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.user_id = auth.uid()
            AND s.status = 'active'
            AND (s.end_date IS NULL OR s.end_date > now())
        )
      );
  END IF;
END $$;

-- Only touch books if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'books') THEN
    ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Books are readable by everyone" ON public.books;
    CREATE POLICY "Books are readable by everyone"
      ON public.books FOR SELECT
      USING (true);
  END IF;
END $$;
