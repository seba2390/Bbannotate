---
applyTo: "*.ts,*.tsx,*.js,*.jsx"
---
# TypeScript/React Frontend Guidelines

Follow these rules for all frontend code generation in this workspace.

## Language & Style
- Target **TypeScript 5.0+** with **React 18+**
- Use **strict TypeScript configuration** (`"strict": true` in tsconfig.json)
- Use **modern ES6+ syntax**:
  - Arrow functions for components and handlers
  - Destructuring for props and state
  - Template literals for strings
  - Optional chaining (`?.`) and nullish coalescing (`??`)
- **Always use TypeScript** - avoid `.js` or `.jsx` files
- Use **functional components with hooks** - no class components

## Type Safety
- **Always define types** for:
  - Component props (use `interface` for component props)
  - Function parameters and return types
  - API responses and request payloads
  - State objects
  - Event handlers
- **Prefer `interface` over `type`** for object shapes (better for extending)
- Use `type` for unions, intersections, and utility types
- Avoid `any` - use `unknown` if type is truly unknown, then narrow it
- Use generic types for reusable components

### Example Type Definitions
```typescript
// Component props
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

// API response
interface UserResponse {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

// Event handlers
const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
  event.preventDefault();
  // ...
};
```

## Core Principles

### Code Quality
- Write **clean, readable, and maintainable code** that prioritizes clarity over cleverness
- Follow **React best practices** and established patterns
- Ensure all code is **self-documenting** with clear naming conventions
- Maintain **consistent code style** throughout the project
- Use **meaningful component and variable names** that clearly describe their purpose
- Prefer explicit over implicit

### Component Design
- **Keep components small and focused** - single responsibility principle
- **Each component should do one thing well**
- **Aim for components under 200 lines**; if larger, consider breaking into smaller components
- Use meaningful component names that describe what they render or do
- **Limit props to 5-7**; consider using composition or context for components needing more
- **Prefer composition over prop drilling** - use children and component composition patterns

### Component Structure
```typescript
// 1. Imports (grouped: React, libraries, components, types, styles)
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import type { User } from '@/types';

// 2. Types/Interfaces
interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

// 3. Component
export function UserProfile({ userId, onUpdate }: UserProfileProps) {
  // 3a. Hooks (state, effects, custom hooks)
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 3b. Event handlers
  const handleUpdate = (): void => {
    // ...
  };
  
  // 3c. Effects
  useEffect(() => {
    // ...
  }, [userId]);
  
  // 3d. Early returns (loading, error states)
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>User not found</div>;
  
  // 3e. Render
  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

### Separation of Concerns
- **Separate business logic from presentation** - use custom hooks for logic
- Keep API calls in dedicated service files or hooks
- Use a clear folder structure:
  ```
  src/
    components/     # Reusable UI components
    pages/          # Page-level components
    hooks/          # Custom hooks
    services/       # API calls and external services
    types/          # TypeScript type definitions
    utils/          # Helper functions
    lib/            # Third-party library configurations
  ```
- Avoid mixing concerns (e.g., don't fetch data directly in render)

## React Best Practices

### Hooks
- **Follow Rules of Hooks**:
  - Only call hooks at the top level (not in loops, conditions, or nested functions)
  - Only call hooks from React functions
- **Custom hooks should start with "use"** (e.g., `useUser`, `useFetch`)
- **Memoize expensive calculations** with `useMemo`
- **Memoize callback functions** passed to child components with `useCallback`
- **Clean up effects** - return cleanup functions from `useEffect` when needed

### State Management
- **Keep state as local as possible** - lift up only when needed
- **Use Context sparingly** - don't use it for frequent updates or as a global state dump
- **Consider state management libraries** (Zustand, Jotai) for complex global state
- **Derive state when possible** - don't store computed values in state
- **Use reducer for complex state logic** - `useReducer` when state has multiple sub-values

### Performance
- **Avoid unnecessary re-renders**:
  - Use `React.memo()` for expensive components
  - Memoize objects and arrays passed as props
  - Use keys properly in lists (stable, unique IDs)
- **Code-split large components** - use `React.lazy()` and `Suspense`
- **Optimize images** - use proper formats, lazy loading, responsive images
- **Debounce/throttle** expensive operations (search inputs, scroll handlers)

### Styling
- **Use Tailwind CSS** for utility-first styling (LLMs excel at Tailwind)
- **Use CSS modules** if you prefer traditional CSS (scoped by default)
- **Use a component library** for consistency:
  - shadcn/ui (recommended - composable, customizable)
  - Material-UI (comprehensive, enterprise-ready)
  - Chakra UI (accessible, themeable)
- **Keep styles colocated** with components when practical
- **Use design tokens** for colors, spacing, typography (maintain consistency)

## Documentation
- Add **JSDoc comments for complex components and functions**:
  ```typescript
  /**
   * Displays user profile information with edit capabilities
   * @param userId - The unique identifier for the user
   * @param onUpdate - Callback fired when user data is updated
   */
  export function UserProfile({ userId, onUpdate }: UserProfileProps) {
    // ...
  }
  ```
- Document non-obvious decisions, trade-offs, and workarounds
- Keep comments up-to-date with code changes
- Prefer self-documenting code over comments when possible

## Imports and Exports
- **Use named exports** for components (better for refactoring and tree-shaking)
- **Group imports logically**:
  1. React and React-related
  2. Third-party libraries
  3. Internal components
  4. Types
  5. Styles/assets
- **Use absolute imports** with path aliases (`@/components` instead of `../../../components`)
- **Avoid barrel exports** for large component sets (can hurt tree-shaking)

## Error Handling
- **Use Error Boundaries** for component-level error catching
- **Handle async errors gracefully** - show user-friendly messages
- **Validate user input** before submission
- **Type-safe error handling**:
  ```typescript
  try {
    const data = await fetchUser(userId);
    setUser(data);
  } catch (error) {
    if (error instanceof Error) {
      setError(error.message);
    } else {
      setError('An unknown error occurred');
    }
  }
  ```

## Testing Philosophy

### Focus on Functionality Over Implementation
- **Test what the user sees and does, not implementation details**
- Avoid testing internal component state or implementation
- Write tests that remain valid when refactoring
- Use React Testing Library (not Enzyme) - encourages testing user behavior
- Focus on edge cases, user interactions, and accessibility

### Test Structure
- Write tests for new components and features
- Use **descriptive test names** that explain the scenario:
  ```typescript
  it('displays error message when login fails', () => {
    // ...
  });
  ```
- Follow **Arrange-Act-Assert (AAA)** pattern
- Keep tests **independent and isolated**
- Use `data-testid` sparingly - prefer accessible queries (role, label, text)

### Testing Best Practices
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('submits form with email and password', async () => {
    // Arrange
    const mockOnSubmit = jest.fn();
    render(<LoginForm onSubmit={mockOnSubmit} />);
    
    // Act
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    
    // Assert
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      });
    });
  });
});
```

## Problem Solving and Debugging

### Root Cause Analysis
- **Never implement superficial fixes** - don't just suppress TypeScript errors
- Always investigate the underlying cause of issues
- Use browser DevTools effectively (React DevTools, Network tab, Console)
- Check the component tree for unexpected re-renders (React DevTools Profiler)

### World-Class Solutions
- Implement comprehensive fixes that address the root problem
- Consider edge cases (null values, empty arrays, loading states, errors)
- Write defensive code that handles unexpected inputs gracefully
- Document complex fixes with clear explanations
- If a TypeScript error appears, understand it before using `any` or `@ts-ignore`

## Accessibility (a11y)

- **Use semantic HTML** - `<button>`, `<nav>`, `<main>`, `<article>`, etc.
- **Provide alt text** for images
- **Use ARIA labels** when semantic HTML isn't enough
- **Ensure keyboard navigation** works (tab order, focus states)
- **Test with screen readers** when building complex interactions
- **Maintain color contrast ratios** (WCAG AA minimum: 4.5:1)
- **Use the `useId` hook** for accessible form labels:
  ```typescript
  import { useId } from 'react';
  
  function InputField() {
    const id = useId();
    return (
      <>
        <label htmlFor={id}>Email</label>
        <input id={id} type="email" />
      </>
    );
  }
  ```

## Security Best Practices

- **Sanitize user input** before rendering (React escapes by default, but be careful with `dangerouslySetInnerHTML`)
- **Validate on both client and server** - client validation is UX, not security
- **Use HTTPS only** for API calls
- **Store secrets in environment variables** - never commit API keys
- **Implement proper CORS** configuration with backend
- **Use Content Security Policy (CSP)** headers

## Building and Tooling

- **Use Vite** for fast development and building (recommended over Create React App)
- **Configure linting** with ESLint and TypeScript ESLint
- **Configure formatting** with Prettier
- **Use strict TypeScript** configuration:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noFallthroughCasesInSwitch": true,
      "noUncheckedIndexedAccess": true
    }
  }
  ```
- **Any warnings during build must be addressed** - don't ignore or suppress them

### Typical Package Scripts
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

### End of Session Checklist
**ALWAYS RUN:** `npm run lint:fix && npm run format && npm run type-check && npm run build` at the end of each session and fix any issues found before declaring the session complete.

## Code Review Mindset
- Write code as if it will be reviewed by senior engineers
- Consider future maintainers who will need to understand and modify your code
- Leave the codebase better than you found it
- Refactor opportunistically when touching existing code
- **Ask yourself:** "Is this component doing too much? Can I split it?"

## Common Patterns

### Custom Hook Example
```typescript
import { useState, useEffect } from 'react';

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  return { data, loading, error };
}
```

### Form Handling
```typescript
import { useState } from 'react';

interface FormData {
  email: string;
  password: string;
}

export function LoginForm() {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    // Submit logic
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
      />
      <input
        type="password"
        name="password"
        value={formData.password}
        onChange={handleChange}
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

---

**Remember:** Clean, type-safe, and well-structured React code is not a luxury—it's a professional standard. Every component is a communication with future developers, including your future self. Build beautiful UIs that are also maintainable and accessible.
