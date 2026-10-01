import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { JsonSchema } from '@/lib/api/types';
import {
  MetadataForm,
  orderedProperties,
  parseMetadata,
  toRawMetadata,
  type RawMetadata,
} from './MetadataForm';

const schema: JsonSchema = {
  type: 'object',
  required: ['sistema_productivo', 'vacas'],
  properties: {
    vacas: { type: 'integer', title: 'Vacas', minimum: 0, 'x-order': 2 },
    sistema_productivo: {
      type: 'string',
      title: 'Sistema productivo',
      enum: ['Cría', 'Invernada'],
      'x-order': 1,
    },
    rinde: { type: 'number', title: 'Rinde esperado', 'x-unit': 't/ha', 'x-order': 3 },
    vacunacion: {
      type: 'string',
      title: 'Última vacunación',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      'x-widget': 'date',
      'x-order': 4,
    },
    riego: { type: 'boolean', title: 'Con riego', 'x-order': 5 },
  },
};

describe('MetadataForm', () => {
  it('ordena las propiedades según x-order', () => {
    expect(orderedProperties(schema).map(([key]) => key)).toEqual([
      'sistema_productivo',
      'vacas',
      'rinde',
      'vacunacion',
      'riego',
    ]);
  });

  it('valida obligatorios, tipos, mínimos y patrones', () => {
    const raw: RawMetadata = {
      sistema_productivo: '',
      vacas: '-3',
      rinde: 'abc',
      vacunacion: '18/05/2026',
      riego: false,
    };
    const { errors } = parseMetadata(schema, raw);
    expect(errors).toEqual({
      sistema_productivo: 'Dato obligatorio',
      vacas: 'Debe ser mayor o igual a 0',
      rinde: 'Ingresá un número',
      vacunacion: 'Fecha inválida',
    });
  });

  it('convierte los valores al tipo del esquema y omite opcionales vacíos', () => {
    const raw: RawMetadata = {
      sistema_productivo: 'Cría',
      vacas: '780',
      rinde: '3,5',
      vacunacion: '',
      riego: true,
    };
    expect(parseMetadata(schema, raw)).toEqual({
      data: { sistema_productivo: 'Cría', vacas: 780, rinde: 3.5, riego: true },
      errors: {},
    });
  });

  it('rechaza decimales en enteros y opciones fuera del enum', () => {
    const { errors } = parseMetadata(schema, { sistema_productivo: 'Feedlot', vacas: '10.5' });
    expect(errors.vacas).toBe('Ingresá un número entero');
    expect(errors.sistema_productivo).toBe('Seleccioná una opción válida');
  });

  it('inicializa el formulario desde la metadata persistida', () => {
    expect(toRawMetadata(schema, { vacas: 780, riego: true })).toEqual({
      sistema_productivo: '',
      vacas: '780',
      rinde: '',
      vacunacion: '',
      riego: true,
    });
  });

  it('renderiza controles según el tipo y propaga los cambios', () => {
    function Harness() {
      const [value, setValue] = useState<RawMetadata>(toRawMetadata(schema));
      return (
        <>
          <MetadataForm
            schema={schema}
            value={value}
            onChange={setValue}
            errors={{ vacas: 'Dato obligatorio' }}
          />
          <output data-testid="value">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByLabelText(/Sistema productivo/).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/Última vacunación/)).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText(/Rinde esperado \(t\/ha\)/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Dato obligatorio');
    fireEvent.change(screen.getByLabelText(/Sistema productivo/), {
      target: { value: 'Invernada' },
    });
    fireEvent.click(screen.getByLabelText('Con riego'));
    expect(screen.getByTestId('value').textContent).toContain('"sistema_productivo":"Invernada"');
    expect(screen.getByTestId('value').textContent).toContain('"riego":true');
  });
});
