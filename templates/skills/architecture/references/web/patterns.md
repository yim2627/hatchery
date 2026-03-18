# Web 아키텍처 패턴

## 목차

- Feature-based 구조 (Next.js App Router) — 디렉토리 구성 + import 규칙
- Server Action 패턴 — 'use server' + Zod 검증 + useActionState
- 데이터 페칭 레이어 분리 — APIClient → Hook → Component
- 경계 위반 패턴 — 컴포넌트 직접 fetch, feature 간 import

---

## Feature-based 구조 (Next.js App Router)

```
app/
  (auth)/
    login/page.tsx
    register/page.tsx
  (dashboard)/
    layout.tsx
    page.tsx
    settings/page.tsx

features/
  auth/
    components/LoginForm.tsx
    hooks/useAuth.ts
    actions/login.ts        ← Server Action
    types.ts
  dashboard/
    components/StatsCard.tsx
    hooks/useDashboard.ts
    actions/loadStats.ts

shared/
  components/Button.tsx
  hooks/useDebounce.ts
  lib/api-client.ts
```

핵심 규칙:
- `features/`의 각 모듈은 독립적. 다른 feature를 직접 import하지 않는다.
- `shared/`는 어디서든 import 가능하지만, feature를 import하지 않는다.
- `app/`은 라우팅만 담당하고, 로직은 features/에 위임한다.

---

## Server Action 패턴

```tsx
// features/auth/actions/login.ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: '입력값이 올바르지 않습니다.' };
  }

  const result = await authService.login(parsed.data);
  if (!result.ok) {
    return { error: '로그인에 실패했습니다.' };
  }

  redirect('/dashboard');
}
```

```tsx
// features/auth/components/LoginForm.tsx
'use client';

import { useActionState } from 'react';
import { login } from '../actions/login';

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      {state?.error && <p>{state.error}</p>}
      <button disabled={pending}>
        {pending ? '로그인 중...' : '로그인'}
      </button>
    </form>
  );
}
```

---

## 데이터 페칭 레이어 분리

```ts
// shared/lib/api-client.ts — 인프라 레이어
class APIClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new APIError(res.status, await res.text());
    return res.json();
  }
}

// features/dashboard/hooks/useDashboard.ts — 프레젠테이션 레이어
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get<DashboardData>('/dashboard'),
    staleTime: 60_000,
  });
}

// features/dashboard/components/StatsCard.tsx — UI 레이어
export function StatsCard() {
  const { data, isLoading, error } = useDashboard();
  // data만 알면 됨. fetch 방법은 모름.
}
```

---

## 경계 위반 패턴

```tsx
// ❌ 컴포넌트에서 직접 fetch
function BadComponent() {
  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);
}

// ❌ feature 간 직접 import
// features/dashboard/components/StatsCard.tsx
import { useAuth } from '../../auth/hooks/useAuth'; // 다른 feature 직접 참조

// ✅ shared를 통하거나 props로 전달
// features/dashboard/components/StatsCard.tsx
interface Props { userId: string } // 필요한 데이터만 props로 받음
```
