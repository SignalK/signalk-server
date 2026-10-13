import type { StylesConfig } from 'react-select'

// react-select renders its own inline styles and is unaware of
// data-bs-theme, so every themed <Select> in this app composes its
// styles with this helper instead of copy-pasting the color rules.
export function getThemedSelectStyles<
  Option,
  IsMulti extends boolean = false
>(): Required<
  Pick<
    StylesConfig<Option, IsMulti>,
    'control' | 'input' | 'placeholder' | 'menu' | 'menuList' | 'option'
  >
> {
  return {
    control: (base, state) => ({
      ...base,
      backgroundColor: 'var(--sk-input-bg)',
      borderColor: state.isFocused
        ? 'var(--bs-primary)'
        : 'var(--sk-input-border-color)',
      boxShadow: state.isFocused
        ? '0 0 0 0.25rem rgba(var(--bs-primary-rgb), 0.25)'
        : 'none',
      '&:hover': {
        borderColor: 'var(--bs-primary)'
      }
    }),
    input: (base) => ({
      ...base,
      color: 'var(--bs-body-color)'
    }),
    placeholder: (base) => ({
      ...base,
      color: 'var(--bs-secondary-color)'
    }),
    menu: (base) => ({
      ...base,
      zIndex: 100,
      backgroundColor: 'var(--bs-body-bg)',
      border: '1px solid var(--sk-dropdown-border-color)'
    }),
    menuList: (base) => ({
      ...base,
      backgroundColor: 'var(--bs-body-bg)'
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? 'var(--bs-primary)'
        : state.isFocused
          ? 'var(--bs-tertiary-bg)'
          : 'transparent',
      color: state.isSelected ? 'var(--bs-white)' : 'var(--bs-body-color)',
      ':hover': {
        backgroundColor: state.isSelected
          ? 'var(--bs-primary)'
          : 'var(--bs-tertiary-bg)'
      }
    })
  }
}
