const fields = [
  { name: 'street', label: 'Street address', maxLength: 200, autoComplete: 'street-address' },
  { name: 'city', label: 'City', maxLength: 100, autoComplete: 'address-level2' },
  { name: 'postalCode', label: 'Postal code', maxLength: 20, autoComplete: 'postal-code' },
  { name: 'country', label: 'Country', maxLength: 100, autoComplete: 'country-name' },
]

export function collectAddress(form) {
  return Object.fromEntries(fields.map(({ name }) => [name, form.get(name).trim()]))
}

export default function AddressFields({ address = {} }) {
  return fields.map(({ name, label, maxLength, autoComplete }) => (
    <label key={name}>
      {label}
      <input name={name} maxLength={maxLength} autoComplete={autoComplete} defaultValue={address[name] ?? ''} required />
    </label>
  ))
}
