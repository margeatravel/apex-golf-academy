-- Create enum for user roles
CREATE TYPE app_role AS ENUM ('admin', 'student');

-- Create enum for lesson status
CREATE TYPE lesson_status AS ENUM ('scheduled', 'completed', 'cancelled');

-- Create profiles table for extended user information
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  photo_url TEXT,
  handicap DECIMAL(4,1),
  goals TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table (separate for security)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create lessons table (synced from Calendly)
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  calendly_event_id TEXT UNIQUE,
  lesson_date DATE NOT NULL,
  lesson_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  lesson_type TEXT NOT NULL,
  status lesson_status DEFAULT 'scheduled',
  revenue DECIMAL(10,2) DEFAULT 0.00,
  coach_notes TEXT,
  student_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create videos table for media uploads
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'video' or 'image'
  thumbnail_url TEXT,
  tags TEXT[],
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  upload_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- RLS Policies for user_roles (read-only for users, admin manages)
CREATE POLICY "Users can view their own roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON user_roles FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for lessons
CREATE POLICY "Students can view their own lessons"
  ON lessons FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins can view all lessons"
  ON lessons FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can update their notes"
  ON lessons FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins can manage all lessons"
  ON lessons FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for videos
CREATE POLICY "Students can view their own videos"
  ON videos FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins can view all videos"
  ON videos FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can upload their videos"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can upload videos for any student"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can update their own videos"
  ON videos FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins can update all videos"
  ON videos FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can delete their own videos"
  ON videos FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Admins can delete all videos"
  ON videos FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Create function to automatically create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- By default, new users are students
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for videos and images
INSERT INTO storage.buckets (id, name, public)
VALUES ('golf-media', 'golf-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for golf-media bucket
CREATE POLICY "Students can view their own media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'golf-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can view all media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'golf-media' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can upload media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'golf-media');

CREATE POLICY "Users can update their own media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'golf-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can update all media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'golf-media' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'golf-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can delete all media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'golf-media' AND has_role(auth.uid(), 'admin'));

-- Create indexes for better performance
CREATE INDEX idx_lessons_student_id ON lessons(student_id);
CREATE INDEX idx_lessons_date ON lessons(lesson_date DESC);
CREATE INDEX idx_lessons_calendly_event ON lessons(calendly_event_id);
CREATE INDEX idx_videos_student_id ON videos(student_id);
CREATE INDEX idx_videos_lesson_id ON videos(lesson_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);