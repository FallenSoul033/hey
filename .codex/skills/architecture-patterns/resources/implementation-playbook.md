# Architecture Patterns Implementation Playbook

This file contains detailed patterns, checklists, and code samples referenced by the skill.

## Core Concepts

### 1. Clean Architecture (Uncle Bob)

**Layers (dependency flows inward):**

- **Entities**: Core business models
- **Use Cases**: Application business rules
- **Interface Adapters**: Controllers, presenters, gateways
- **Frameworks & Drivers**: UI, database, external services

**Key Principles:**

- Dependencies point inward
- Inner layers know nothing about outer layers
- Business logic independent of frameworks
- Testable without UI, database, or external services

### 2. Hexagonal Architecture (Ports and Adapters)

**Components:**

- **Domain Core**: Business logic
- **Ports**: Interfaces defining interactions
- **Adapters**: Implementations of ports (database, REST, message queue)

**Benefits:**

- Swap implementations easily (mock for testing)
- Technology-agnostic core
- Clear separation of concerns

### 3. Domain-Driven Design (DDD)

**Strategic Patterns:**

- **Bounded Contexts**: Separate models for different domains
- **Context Mapping**: How contexts relate
- **Ubiquitous Language**: Shared terminology

**Tactical Patterns:**

- **Entities**: Objects with identity
- **Value Objects**: Immutable objects defined by attributes
- **Aggregates**: Consistency boundaries
- **Repositories**: Data access abstraction
- **Domain Events**: Things that happened

## Clean Architecture Pattern

### Directory Structure

```
app/
├── domain/           # Entities & business rules
│   ├── entities/
│   │   ├── user.py
│   │   └── order.py
│   ├── value_objects/
│   │   ├── email.py
│   │   └── money.py
│   └── interfaces/   # Abstract interfaces
│       ├── user_repository.py
│       └── payment_gateway.py
├── use_cases/        # Application business rules
│   ├── create_user.py
│   ├── process_order.py
│   └── send_notification.py
├── adapters/         # Interface implementations
│   ├── repositories/
│   │   ├── postgres_user_repository.py
│   │   └── redis_cache_repository.py
│   ├── controllers/
│   │   └── user_controller.py
│   └── gateways/
│       ├── stripe_payment_gateway.py
│       └── sendgrid_email_gateway.py
└── infrastructure/   # Framework & external concerns
    ├── database.py
    ├── config.py
    └── logging.py
```

### Implementation Example

```python
# domain/entities/user.py
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class User:
    """Core user entity - no framework dependencies."""
    id: str
    email: str
    name: str
    created_at: datetime
    is_active: bool = True

    def deactivate(self):
        """Business rule: deactivating user."""
        self.is_active = False

    def can_place_order(self) -> bool:
        """Business rule: active users can order."""
        return self.is_active

# domain/interfaces/user_repository.py
from abc import ABC, abstractmethod
from typing import Optional, List
from domain.entities.user import User

class IUserRepository(ABC):
    """Port: defines contract, no implementation."""

    @abstractmethod
    async def find_by_id(self, user_id: str) -> Optional[User]:
        pass

    @abstractmethod
    async def find_by_email(self, email: str) -> Optional[User]:
        pass

    @abstractmethod
    async def save(self, user: User) -> User:
        pass

    @abstractmethod
    async def delete(self, user_id: str) -> bool:
        pass

# use_cases/create_user.py
from domain.entities.user import User
from domain.interfaces.user_repository import IUserRepository
from dataclasses import dataclass
from datetime import datetime
import uuid

@dataclass
class CreateUserRequest:
    email: str
    name: str

@dataclass
class CreateUserResponse:
    user: User
    success: bool
    error: Optional[str] = None

class CreateUserUseCase:
    """Use case: orchestrates business logic."""

    def __init__(self, user_repository: IUserRepository):
        self.user_repository = user_repository

    async def execute(self, request: CreateUserRequest) -> CreateUserResponse:
        existing = await self.user_repository.find_by_email(request.email)
        if existing:
            return CreateUserResponse(user=None, success=False, error="Email already exists")

        user = User(
            id=str(uuid.uuid4()),
            email=request.email,
            name=request.name,
            created_at=datetime.now(),
            is_active=True
        )

        saved_user = await self.user_repository.save(user)
        return CreateUserResponse(user=saved_user, success=True)
```

## Hexagonal Architecture Pattern

Core domain depends on ports (interfaces), while adapters implement database, payment, notification, REST or other external concerns. Keep business logic independent from infrastructure so implementations can be replaced and tested safely.

## Domain-Driven Design Pattern

Use value objects, entities, aggregates, repositories, bounded contexts, ubiquitous language and domain events to represent complex business rules and consistency boundaries.

## Best Practices

1. **Dependency Rule**: Dependencies always point inward
2. **Interface Segregation**: Small, focused interfaces
3. **Business Logic in Domain**: Keep frameworks out of core
4. **Test Independence**: Core testable without infrastructure
5. **Bounded Contexts**: Clear domain boundaries
6. **Ubiquitous Language**: Consistent terminology
7. **Thin Controllers**: Delegate to use cases
8. **Rich Domain Models**: Behavior with data

## Common Pitfalls

- **Anemic Domain**: Entities with only data, no behavior
- **Framework Coupling**: Business logic depends on frameworks
- **Fat Controllers**: Business logic in controllers
- **Repository Leakage**: Exposing ORM objects
- **Missing Abstractions**: Concrete dependencies in core
- **Over-Engineering**: Clean architecture for simple CRUD
