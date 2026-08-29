import { useEffect, useState } from 'react';
import { getPeople } from '../services/people';

export function People() {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPeople() {
      try {
        const data = await getPeople();

        console.log('PEOPLE FROM SUPABASE:', data);

        setPeople(data);
      } catch (err: any) {
        console.error('SUPABASE ERROR:', err);
        setError(err.message || 'Failed to load people');
      } finally {
        setLoading(false);
      }
    }

    loadPeople();
  }, []);

  if (loading) {
    return <div style={{ padding: 30 }}>Loading people...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 30, color: 'red' }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">
        <h2>Employees &amp; vendors</h2>
      </div>

      <div className="card" style={{ padding: 20 }}>
        {people.length === 0 ? (
          <p>No people found in Supabase.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 10 }}>Name</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Email</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Type</th>
              </tr>
            </thead>

            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td style={{ padding: 10 }}>
                    {person.full_name}
                  </td>

                  <td style={{ padding: 10 }}>
                    {person.email}
                  </td>

                  <td style={{ padding: 10 }}>
                    {person.type_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}