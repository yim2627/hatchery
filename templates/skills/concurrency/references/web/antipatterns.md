# Web 비동기 패턴과 안티패턴

## 체크리스트

| ID | 안티패턴 | 심각도 | 탐지 규칙 | 수정 방법 |
|---|---|---|---|---|
| C1 | useEffect 클린업 없는 fetch | CRITICAL | `useEffect` 안에 `fetch`가 있는데 `AbortController` 없음 | AbortController로 클린업 |
| C2 | 미처리 Promise rejection | CRITICAL | `fetch()` 호출에 `await` 없고 `.catch` 없음 | await + 에러 처리 |
| C3 | 경쟁 조건 — 빠른 입력 | CRITICAL | async 핸들러에서 setState 전에 최신 요청 체크 없음 | latest-only 패턴 (useRef) |
| W1 | Promise.all 부분 실패 | WARNING | 독립 요청에 `Promise.all` 사용 | `Promise.allSettled` 사용 |
| W2 | 워터폴 요청 | WARNING | 독립적인 await가 순차적으로 나열됨 | `Promise.all`로 병렬화 |
| W3 | Next.js 클라이언트 fetch 남용 | WARNING | `'use client'` + `useEffect` + `fetch` 조합 | Server Component에서 직접 fetch |

## 목차

- C1. useEffect 클린업 없는 fetch
- C2. 미처리 Promise rejection
- C3. 경쟁 조건 — 빠른 입력
- W1. Promise.all로 독립 요청 처리 시 부분 실패
- W2. 워터폴 요청
- W3. Next.js에서 클라이언트 사이드 fetch 남용
- 패턴: Debounce with AbortController, Web Worker

---

## CRITICAL

### C1. useEffect 클린업 없는 fetch

```tsx
// ❌ 언마운트 후에도 setState 호출 → 메모리 릭 + 경고
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(data => setUser(data));
  }, [userId]);
}

// ✅ AbortController로 클린업
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/users/${userId}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setUser(data))
      .catch(err => {
        if (err.name !== 'AbortError') throw err;
      });

    return () => controller.abort();
  }, [userId]);
}
```

### C2. 미처리 Promise rejection

```ts
// ❌ 에러가 삼켜짐
async function saveData(data: FormData) {
  fetch('/api/save', { method: 'POST', body: data });
  // await도 없고 catch도 없음 → 실패해도 모름
}

// ✅ 에러 처리
async function saveData(data: FormData) {
  const res = await fetch('/api/save', { method: 'POST', body: data });
  if (!res.ok) {
    throw new Error(`저장 실패: ${res.status}`);
  }
  return res.json();
}
```

### C3. 경쟁 조건 — 빠른 입력

```tsx
// ❌ 이전 요청이 나중에 도착하면 결과 꼬임
function Search() {
  const [results, setResults] = useState([]);

  const handleChange = async (query: string) => {
    const data = await searchAPI(query);
    setResults(data); // "ab" 결과가 "abc" 결과보다 늦게 오면?
  };
}

// ✅ latest-only 패턴
function Search() {
  const [results, setResults] = useState([]);
  const latestRef = useRef(0);

  const handleChange = async (query: string) => {
    const requestId = ++latestRef.current;
    const data = await searchAPI(query);
    if (requestId === latestRef.current) {
      setResults(data);
    }
  };
}
```

---

## WARNING

### W1. Promise.all로 독립 요청 처리 시 하나 실패하면 전부 날아감

```ts
// ❌ 하나 실패 → 전부 실패
const [users, posts, comments] = await Promise.all([
  fetchUsers(),
  fetchPosts(),
  fetchComments(), // 이게 실패하면 users, posts도 날아감
]);

// ✅ 독립적으로 처리
const results = await Promise.allSettled([
  fetchUsers(),
  fetchPosts(),
  fetchComments(),
]);

const users = results[0].status === 'fulfilled' ? results[0].value : [];
const posts = results[1].status === 'fulfilled' ? results[1].value : [];
```

### W2. 워터폴 요청

```ts
// ❌ 순차 실행 — 불필요하게 느림
const user = await fetchUser(id);
const posts = await fetchPosts(id);
const comments = await fetchComments(id);

// ✅ 병렬 실행
const [user, posts, comments] = await Promise.all([
  fetchUser(id),
  fetchPosts(id),
  fetchComments(id),
]);
```

### W3. Next.js에서 클라이언트 사이드 fetch 남용

```tsx
// ❌ 서버에서 가져올 수 있는 데이터를 클라이언트에서 fetch
'use client';
export default function Page() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);
}

// ✅ Server Component에서 직접 fetch
export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 60 },
  }).then(r => r.json());

  return <DataView data={data} />;
}
```

---

## 패턴

### Debounce with AbortController

```ts
function useDebouncedSearch(delay = 300) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const controllerRef = useRef<AbortController>();

  useEffect(() => {
    if (!query) { setResults([]); return; }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const data = await searchAPI(query, controller.signal);
        setResults(data);
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, delay]);

  return { query, setQuery, results };
}
```

### Web Worker로 무거운 작업 분리

```ts
// worker.ts
self.onmessage = (e: MessageEvent<number[]>) => {
  const sorted = e.data.sort((a, b) => a - b); // CPU 무거운 작업
  self.postMessage(sorted);
};

// 사용측
const worker = new Worker(new URL('./worker.ts', import.meta.url));
worker.postMessage(largeArray);
worker.onmessage = (e) => {
  setResults(e.data);
};
```
