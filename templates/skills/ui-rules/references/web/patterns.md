# React 패턴과 안티패턴

## 목차

- 안티패턴: 불필요한 useMemo/useCallback, useEffect 의존성 거짓말, 컴포넌트 안에서 컴포넌트 정의, prop drilling
- Server Component vs Client Component (Next.js App Router) — 역할 구분 + 분리 기준
- 상태 관리 패턴: URL을 source of truth로, 서버 상태와 클라이언트 상태 분리

---

## 안티패턴

### 불필요한 useMemo/useCallback

```tsx
// ❌ 단순 값에 useMemo → 오히려 오버헤드
const label = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName]);

// ✅ 그냥 계산
const label = `${firstName} ${lastName}`;
```

useMemo/useCallback이 필요한 경우:
- 리스트의 각 아이템 렌더링에 전달되는 함수 (React.memo 조합 시)
- 실제로 비싼 계산 (수백 개 아이템 정렬/필터)
- useEffect 의존성 안정화

### useEffect 의존성 거짓말

```tsx
// ❌ 린트 억제 → 버그의 시작
useEffect(() => {
  fetchData(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // userId가 바뀌어도 다시 안 돌아감

// ✅ 정직한 의존성
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

### 컴포넌트 안에서 컴포넌트 정의

```tsx
// ❌ 매 렌더마다 새 컴포넌트 → 상태 초기화
function Parent() {
  const Child = () => <input />; // 매번 새로 만들어짐
  return <Child />;
}

// ✅ 바깥에 정의
const Child = () => <input />;

function Parent() {
  return <Child />;
}
```

### prop drilling 3단계 이상

```tsx
// ❌
<App theme={theme}>
  <Layout theme={theme}>
    <Sidebar theme={theme}>
      <NavItem theme={theme} />

// ✅ Context 사용
const ThemeContext = createContext<Theme>(defaultTheme);

function App() {
  return (
    <ThemeContext.Provider value={theme}>
      <Layout />
    </ThemeContext.Provider>
  );
}

function NavItem() {
  const theme = useContext(ThemeContext);
}
```

---

## Server Component vs Client Component (Next.js App Router)

```
서버에서 할 수 있는 건 서버에서 한다.
```

| | Server Component | Client Component |
|---|---|---|
| 데이터 fetch | ✅ 직접 await | useEffect / React Query |
| 이벤트 핸들러 | ❌ | ✅ onClick, onChange |
| 상태 (useState) | ❌ | ✅ |
| 브라우저 API | ❌ | ✅ window, localStorage |
| 번들 크기 | 포함 안 됨 | 포함 |

```tsx
// Server Component (기본값)
export default async function UserPage({ params }) {
  const user = await db.user.findUnique({ where: { id: params.id } });
  return (
    <div>
      <h1>{user.name}</h1>
      <LikeButton userId={user.id} />  {/* 인터랙티브한 부분만 Client */}
    </div>
  );
}

// Client Component (인터랙션 필요한 부분만)
'use client';
export function LikeButton({ userId }: { userId: string }) {
  const [liked, setLiked] = useState(false);
  return <button onClick={() => setLiked(!liked)}>좋아요</button>;
}
```

---

## 상태 관리 패턴

### URL을 source of truth로

```tsx
// ❌ 필터를 useState로만 관리 → 새로고침하면 사라짐
const [filter, setFilter] = useState('all');

// ✅ URL params를 source of truth로
import { useSearchParams } from 'next/navigation';

function FilteredList() {
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter') ?? 'all';
  // 뒤로가기, 공유, 새로고침 모두 유지
}
```

### 서버 상태와 클라이언트 상태 분리

```tsx
// 서버 상태 → React Query / SWR
const { data: users } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});

// 클라이언트 상태 → useState / Zustand
const [selectedId, setSelectedId] = useState<string | null>(null);

// 이 둘을 하나의 store에 섞지 않는다.
```
