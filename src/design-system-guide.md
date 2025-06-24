# MetaKeyAI Design System

This design system provides a consistent visual language across all MetaKeyAI UI components.

## Getting Started

Include the shared styles in your HTML:

```html
<link rel="stylesheet" href="shared-styles.css">
```

## Core Design Principles

- **Glass Morphism**: Translucent backgrounds with blur effects
- **Consistent Color Palette**: Primary blues with semantic colors for states
- **Smooth Animations**: Subtle transitions and hover effects
- **Modern Typography**: Clean, readable fonts with proper hierarchy

## CSS Variables

All design tokens are defined as CSS custom properties for consistency:

### Colors
- `--color-primary`: #4facfe (Primary blue)
- `--color-primary-end`: #00f2fe (Gradient end)
- `--color-success`: #4CAF50 (Success green)
- `--color-warning`: #ff9800 (Warning orange)
- `--color-error`: #f44336 (Error red)

### Backgrounds
- `--bg-primary`: Main gradient background
- `--bg-secondary`: Dark page background
- `--glass-light`: Light glass effect
- `--glass-medium`: Medium glass effect
- `--glass-dark`: Dark glass effect

### Spacing
- `--space-xs`: 0.25rem
- `--space-sm`: 0.5rem
- `--space-md`: 1rem
- `--space-lg`: 1.5rem
- `--space-xl`: 2rem
- `--space-2xl`: 3rem

### Border Radius
- `--radius-sm`: 6px
- `--radius-md`: 10px
- `--radius-lg`: 15px
- `--radius-xl`: 20px
- `--radius-pill`: 25px

## Component Classes

### Containers
- `.metakey-container`: Full-screen container with gradient background
- `.metakey-page`: Page-level container with dark background
- `.metakey-section`: Section with glass background
- `.metakey-card`: Card with glass effect

### Typography
- `.metakey-title`: Large title with gradient text
- `.metakey-subtitle`: Secondary title
- `.text-primary`, `.text-secondary`, `.text-muted`: Text colors

### Buttons
- `.metakey-btn`: Primary button with gradient
- `.metakey-btn.secondary`: Secondary button with glass effect
- `.metakey-btn.outline`: Outlined button
- `.metakey-btn.primary`: Solid primary color button

### Forms
- `.metakey-form-input`: Text input with glass background
- `.metakey-form-select`: Select dropdown
- `.metakey-form-label`: Form labels
- `.metakey-form-help`: Help text

### Status Components
- `.metakey-status`: Status indicator
- `.metakey-status.connected`: Success state
- `.metakey-status.disconnected`: Error state
- `.metakey-status.testing`: Warning state

### Glass Components
- `.glass`: Standard glass effect
- `.glass-light`: Light glass variant
- `.glass-dark`: Dark glass variant

### Utilities
- `.flex`, `.flex-col`: Flexbox utilities
- `.items-center`, `.justify-center`: Alignment utilities
- `.gap-sm`, `.gap-md`, `.gap-lg`: Gap utilities
- `.w-full`, `.h-full`: Size utilities

## Magic Effects

Special animation components for enhanced UX:

- `.magic-orb`: Animated orb with glow effect
- `.magic-text`: Shimmer text animation
- `.metakey-pattern`: Background pattern animation

## Usage Examples

### Basic Page Layout

```html
<body class="metakey-page">
    <div class="metakey-pattern"></div>
    
    <div class="container">
        <header class="metakey-header">
            <h1 class="metakey-title">🔮 MetaKeyAI</h1>
            <p class="metakey-subtitle">Your AI companion</p>
        </header>
        
        <main class="metakey-section">
            <h2 class="section-title">Settings</h2>
            <p class="section-description">Configure your preferences</p>
            
            <div class="metakey-form-group">
                <label class="metakey-form-label">API Key</label>
                <input class="metakey-form-input" type="password" placeholder="sk-...">
                <div class="metakey-form-help">Your key is stored securely</div>
            </div>
            
            <button class="metakey-btn primary">Save Settings</button>
        </main>
    </div>
</body>
```

### Status Components

```html
<div class="metakey-status connected">
    <div class="status-dot"></div>
    <span>Connected</span>
</div>

<div class="metakey-status disconnected">
    <div class="status-dot"></div>
    <span>Disconnected</span>
</div>
```

### Glass Cards

```html
<div class="metakey-card">
    <h3>API Configuration</h3>
    <p>Set up your OpenAI credentials</p>
    <button class="metakey-btn">Configure</button>
</div>
```

## Responsive Design

The design system includes responsive utilities and breakpoints:

- Mobile-first approach
- Clamp functions for fluid typography
- Responsive spacing and sizing
- Mobile-specific component adjustments

## Animations

All animations use consistent timing and easing:

- `--transition-fast`: 0.2s for quick interactions
- `--transition-normal`: 0.3s for standard transitions
- `--transition-slow`: 0.5s for complex animations
- `--transition-bounce`: Cubic bezier for smooth animations

## Best Practices

1. **Always use CSS variables** instead of hardcoded values
2. **Use component classes** rather than writing custom styles
3. **Follow the spacing scale** for consistent layouts
4. **Use semantic color classes** for status indicators
5. **Test on mobile devices** to ensure responsive behavior
6. **Maintain glass effect hierarchy** (light > medium > dark)

## Migration from Legacy Styles

To update existing components:

1. Replace hardcoded colors with CSS variables
2. Update class names to use design system classes
3. Replace custom spacing with the spacing scale
4. Use consistent border radius values
5. Apply glass morphism effects where appropriate

This design system ensures visual consistency across all MetaKeyAI interfaces while providing flexibility for future enhancements. 