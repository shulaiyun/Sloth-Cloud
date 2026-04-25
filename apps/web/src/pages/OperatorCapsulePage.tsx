import { Navigate, useParams } from 'react-router-dom';

export function OperatorCapsulePage() {
  const { capsuleId } = useParams();
  if (!capsuleId) {
    return <Navigate replace to="/operator-lab" />;
  }

  return <Navigate replace to={`/operator-lab/${capsuleId}`} />;
}
