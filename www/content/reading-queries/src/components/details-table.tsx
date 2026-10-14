export function DetailsTable(props: { details: { readonly body: string } }) {
	return (
		<table>
			<tbody>
				<tr>
					<th>Body</th>
					<td>{props.details.body}</td>
				</tr>
			</tbody>
		</table>
	);
}
