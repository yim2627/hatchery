# iOS 아키텍처 패턴

## 목차

- MVVM with Repository — View ↔ ViewModel ↔ Repository ↔ API/DB 전체 예시
- 의존성 주입 — Pure DI (서비스 로케이터 ❌ → 생성자 주입 ✅)
- 레이어 경계 위반 패턴 — View/ViewModel/Repository 간 잘못된 참조

---

## MVVM with Repository

가장 흔한 iOS 아키텍처. View ↔ ViewModel ↔ Repository ↔ API/DB.

```swift
// ── Model ──
struct User: Codable, Identifiable {
    let id: String
    let name: String
    let email: String
}

// ── Repository (데이터 접근 경계) ──
protocol UserRepositoryProtocol: Sendable {
    func fetchUser(id: String) async throws -> User
    func saveUser(_ user: User) async throws
}

struct UserRepository: UserRepositoryProtocol {
    let apiClient: APIClient
    let localStorage: LocalStorage

    func fetchUser(id: String) async throws -> User {
        // 캐시 → API 폴백
        if let cached = try? await localStorage.load(User.self, key: "user_\(id)") {
            return cached
        }
        let user = try await apiClient.request(.getUser(id))
        try? await localStorage.save(user, key: "user_\(id)")
        return user
    }
}

// ── ViewModel ──
@Observable
final class UserViewModel {
    enum State { case idle, loading, loaded(User), error(Error) }

    var state: State = .idle
    private let repository: UserRepositoryProtocol

    init(repository: UserRepositoryProtocol) {
        self.repository = repository
    }

    @MainActor
    func load(id: String) async {
        state = .loading
        do {
            let user = try await repository.fetchUser(id: id)
            state = .loaded(user)
        } catch {
            state = .error(error)
        }
    }
}

// ── View ──
struct UserView: View {
    @State private var vm: UserViewModel
    let userId: String

    init(userId: String, repository: UserRepositoryProtocol) {
        self.userId = userId
        self._vm = State(initialValue: UserViewModel(repository: repository))
    }

    var body: some View {
        Group {
            switch vm.state {
            case .idle, .loading:
                ProgressView()
            case .loaded(let user):
                Text(user.name)
            case .error(let error):
                Text(error.localizedDescription)
            }
        }
        .task { await vm.load(id: userId) }
    }
}
```

---

## 의존성 주입 — Pure DI

```swift
// ❌ 서비스 로케이터 / 전역 싱글턴
class ProfileViewModel {
    func load() async {
        let user = try await ServiceLocator.shared.userRepository.fetchUser(id: "me")
    }
}

// ✅ 생성자 주입
class ProfileViewModel {
    private let userRepository: UserRepositoryProtocol

    init(userRepository: UserRepositoryProtocol) {
        self.userRepository = userRepository
    }
}

// Composition Root (앱 진입점에서 조립)
@main
struct MyApp: App {
    let apiClient = APIClient(baseURL: Config.apiBaseURL)
    let localStorage = LocalStorage()

    var body: some Scene {
        WindowGroup {
            let repository = UserRepository(apiClient: apiClient, localStorage: localStorage)
            ContentView(repository: repository)
        }
    }
}
```

---

## 레이어 경계 위반 패턴

```swift
// ❌ View에서 직접 네트워킹
struct BadView: View {
    @State private var data: Data?

    var body: some View {
        Text("...")
            .task {
                let (data, _) = try! await URLSession.shared.data(from: someURL)
                self.data = data
            }
    }
}

// ❌ ViewModel에서 UIKit 의존
class BadViewModel: ObservableObject {
    func showAlert() {
        let alert = UIAlertController(...)  // ViewModel이 UI를 알면 안 됨
    }
}

// ❌ Repository에서 View 상태 직접 변경
class BadRepository {
    weak var viewModel: SomeViewModel?
    func fetch() async {
        let data = try await api.fetch()
        viewModel?.items = data  // Repository가 ViewModel을 알면 안 됨
    }
}
```
