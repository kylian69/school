import { MaFormation } from '@scolaly/contracts';
import { Badge, Card } from '@scolaly/ui';
import type { Metadata } from 'next';
import { fr } from '@/i18n/fr';
import { apiGet } from '@/lib/api';
import { resumeRegle } from '../formations/champs-regle';

const t = fr.maFormation;
const tm = fr.referentiel.maquette;
export const metadata: Metadata = { title: t.titre };

const nb = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

/** E-02-07 · Ma formation : maquette lisible et règles de validation expliquées (US-02-10). */
export default async function MaFormationPage() {
  const { data } = await apiGet('/api/moi/formation', MaFormation);
  return (
    <>
      <h1 className="text-[26px] font-[650] tracking-[-0.035em] md:text-[30px]">{t.titre}</h1>
      {!data ? (
        <Card>
          <p role="alert" className="text-sm">
            {t.indisponible}
          </p>
        </Card>
      ) : data.formations.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t.vide}</p>
        </Card>
      ) : (
        data.formations.map(({ promotion, option, maquette }) => {
          const ues = maquette.ues.filter(
            (u) =>
              u.annee === promotion.anneeFormation && (u.option === null || u.option === option),
          );
          const periodes = [...new Set(ues.map((u) => u.semestre))];
          const { regles } = maquette;
          return (
            <section
              key={promotion.id}
              aria-label={promotion.libelle}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">{promotion.libelle}</h2>
                {option ? <p className="text-sm text-muted">{t.option(option)}</p> : null}
              </div>
              {periodes.map((semestre) => (
                <div key={String(semestre)} className="flex flex-col gap-2">
                  <h3 className="font-semibold">
                    {semestre === null
                      ? tm.annuelle
                      : tm.semestre(promotion.anneeFormation, semestre)}
                  </h3>
                  {ues
                    .filter((u) => u.semestre === semestre)
                    .map((u) => (
                      <Card key={u.id} className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h4 className="font-medium">{`${u.code} · ${u.intitule}`}</h4>
                          <div className="flex gap-1">
                            {u.ects > 0 ? <Badge tone="accent">{t.ects(nb(u.ects))}</Badge> : null}
                            <Badge>{t.coefficient(nb(u.coefficient))}</Badge>
                          </div>
                        </div>
                        <ul className="flex flex-col gap-1 text-sm">
                          {maquette.modules
                            .filter((m) => m.ueId === u.id)
                            .map((m) => (
                              <li
                                key={m.id}
                                className="flex justify-between gap-2 border-t border-line pt-1"
                              >
                                <span>{m.intitule}</span>
                                <span className="shrink-0 text-muted">
                                  {t.coefficient(nb(m.coefficient))}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </Card>
                    ))}
                </div>
              ))}
              <Card className="flex flex-col gap-2">
                <h3 className="font-semibold">{t.regles}</h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  <li>{t.modes[regles.mode]}</li>
                  <li>{t.seuil(nb(regles.seuil))}</li>
                  {regles.noteEliminatoire !== null ? (
                    <li>{t.eliminatoire(nb(regles.noteEliminatoire))}</li>
                  ) : null}
                  {regles.mode === 'lmd' && regles.compensationSemestres ? (
                    <li>{t.compensationSemestres}</li>
                  ) : null}
                  {regles.mentions.length > 0 ? (
                    <li>
                      {t.mentions(
                        regles.mentions.map((m) => `${m.libelle} ${nb(m.seuil)}`).join(', '),
                      )}
                    </li>
                  ) : null}
                </ul>
                {maquette.reglesParticulieres.length > 0 ? (
                  <>
                    <h4 className="text-sm font-medium">{t.particulieres}</h4>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                      {maquette.reglesParticulieres.map((r) => (
                        <li key={r.id}>{`${r.libelle} : ${resumeRegle(r.regle)}`}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </Card>
              {maquette.competences.length > 0 ? (
                <Card className="flex flex-col gap-2">
                  <h3 className="font-semibold">{t.competences}</h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {maquette.competences.map((c) => (
                      <li key={c.id}>{`${c.code} · ${c.intitule}`}</li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </section>
          );
        })
      )}
    </>
  );
}
