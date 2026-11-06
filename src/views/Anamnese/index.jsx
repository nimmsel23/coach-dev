import { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import Level1 from "./Level1.jsx";
import Level2 from "./Level2.jsx";

export default function Anamnese() {
  const { level1Complete } = useUser();
  const [editLevel1, setEditLevel1] = useState(false);

  if (!level1Complete || editLevel1) {
    return <Level1 onComplete={() => setEditLevel1(false)} />;
  }
  return <Level2 onEditLevel1={() => setEditLevel1(true)} />;
}
